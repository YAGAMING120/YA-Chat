# Live smoke check: boots the React app in headless Edge and drives the
# interaction steps (selectors/Escape/canvas/tools/project modal/etc.).
# Usage: powershell -File scripts/live-parity.ps1   (exit 0 = all ok)
param(
  [int]$ReactPort = 5199
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$liveDir = Join-Path $PSScriptRoot 'live'
$edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host 'no headless browser found'; exit 2 }

$procs = @()
function Cleanup {
  foreach ($p in $procs) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Get-NetTCPConnection -LocalPort $ReactPort -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
trap { Cleanup; break }

# 1. dev server
$procs += Start-Process npx.cmd -ArgumentList 'vite', '--port', $ReactPort, '--strictPort' -WorkingDirectory $root -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5

# 2. harness copy served from the app's origin
$harness = Get-Content (Join-Path $liveDir 'harness.html') -Raw
$reactHarness = $harness -replace '__APP__', '/index.html'
Set-Content (Join-Path $root '.live-harness-react.html') $reactHarness -Encoding UTF8 -NoNewline

$tmp = Join-Path $env:TEMP 'ya-chat-live'
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$results = @()

$url = "http://localhost:$ReactPort/.live-harness-react.html"
$out = Join-Path $tmp 'live-REACT.html'
# Chromium logs noise on stderr; never let it abort the run (PS 5.1 quirk)
$ErrorActionPreference = 'Continue'
& $edge --headless=new --disable-gpu --no-first-run --user-data-dir="$tmp\profile1" `
  --virtual-time-budget=25000 --dump-dom $url 2>$null | Out-File $out -Encoding UTF8
$ErrorActionPreference = 'Stop'
$content = Get-Content $out -Raw
$results += '=== REACT'
if ($content -match '(?s)<pre id="results">(.*?)</pre>') {
  $results += $Matches[1].Trim() -split "`n"
} else {
  $results += 'FAIL harness produced no results'
}

# 3. summarize
$fail = ($results | Where-Object { $_ -match '^\s*(FAIL|ERROR)' }).Count
$ok = ($results | Where-Object { $_ -match '^\s*ok' }).Count
$results | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "live smoke: ok=$ok fail=$fail"
Cleanup
Remove-Item (Join-Path $root '.live-harness-react.html') -Force -ErrorAction SilentlyContinue
exit $(if ($fail -eq 0) { 0 } else { 1 })
