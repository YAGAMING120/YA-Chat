# YA Chat

A streaming chat UI for [OpenRouter](https://openrouter.ai) — hundreds of models behind one OpenAI-compatible API.

## Features

- Streaming responses (SSE) with live reasoning/thinking blocks
- Model picker with search, provider grouping, modality badges (`FREE`, `TTS`, `EMBED`, `RERANK`, …) and filters for All / Free / Chat / Voice — every free model on OpenRouter, including the ones the default `/models` call hides
- **Text to speech**: the speaker button in the composer (or **Listen** on any reply) opens a TTS modal — pick a voice model/voice/speed, generate MP3 (or raw PCM) and download it. Powered by OpenRouter's free `deepgram/flux-tts:free` and `fish-audio/s2.1-pro-free:free`
- **Server tools**: a **Tools** button in the composer switches on OpenRouter's server-side tools — `web search` (with cited sources rendered under the reply), `date & time`, `read a URL`, and `image generation`. OpenRouter runs them during the request, so nothing is executed in the browser.
- Chat history, projects, system prompts, attachments (images, PDF, text)
- Artifact panel with live code preview
- **Canvas**: the model can reply into an editable side panel — a rich-text document or a code file with preview. Toggle it from the composer, or let the model open it by emitting a `<canvas>` block. Canvas edits round-trip back to the model (`Ask AI to edit`), and the panel is persisted per session.

## Setup

1. Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Open the app → **Settings** → paste the key (stored only in your browser)
3. Pick a model from the header selector

## Run locally

The `/api/proxy` route is a Vercel serverless function, so run the project with the Vercel CLI:

```
npm i -g vercel
vercel dev
```

## Deploy

Push to a Git repo and import it into Vercel, or run `vercel`. No environment variables are required — see [.env.example](.env.example).

## Architecture

| Path | Purpose |
| --- | --- |
| `index.html` | App shell |
| `js/` | UI, chat, storage, model list, API client |
| `js/canvas.js` | Canvas panel: document/code editors, `<canvas>` protocol, AI-edit commands |
| `js/tts.js` | Text-to-speech modal: model/voice picking, `POST /audio/speech`, MP3 download |
| `js/capabilities.js` | Modality lookup shared by the picker, composer and TTS (chat vs speech vs embeddings) |
| `js/tools.js` | Server tools: toggles, `tools` payload builder, popover UI |
| `api/proxy.js` | Serverless proxy to `https://openrouter.ai/api/v1` (forwards query params, streams SSE, passes audio bytes through untouched) |
| `style/` | Stylesheets |

## Canvas protocol

Replies may include a `<canvas>` block that the client extracts before rendering:

```html
<canvas title="Readme" type="doc" action="replace">**Markdown** body</canvas>
<canvas title="Pricing card" type="code" lang="html" action="append"><div>…</div></canvas>
```

`type` is `doc` (markdown → editable document) or `code` (source, with `lang` and an optional live preview); `action` is `replace`, `append`, or `prepend`. When the panel is open, the current canvas content is injected into the system prompt so follow-up turns can edit it in place. Panel visibility is mutually exclusive with the artifact panel.

## Server tools

The **Tools** button in the composer opens a popover of OpenRouter server tools. Everything is **off by default** — a request only gains a `tools` array once you switch something on, so the normal chat path is untouched. Selections persist in `localStorage` (`or_tools_v1`).

| Tool | `type` | Notes |
| --- | --- | --- |
| Web search | `openrouter:web_search` | `max_results: 5`, `max_uses: 3`. Engine `auto` (provider-native where available, otherwise Exa) — billed per search. Citations come back as `url_citation` annotations. |
| Date & time | `openrouter:datetime` | Free |
| Read a URL | `openrouter:web_fetch` | Pinned to the free `openrouter` engine, `max_uses: 5`. Handles pages and PDFs. |
| Image generation | `openrouter:image_generation` | Optional image model (free models listed first, default `openai/gpt-5-image`) |

The payload also carries `max_tool_calls: 8` to bound how many steps a request may spend in the tool loop.

```json
{ "model": "...", "messages": [ ... ], "stream": true,
  "tools": [{ "type": "openrouter:web_search", "parameters": { "max_results": 5, "max_uses": 3 } }],
  "max_tool_calls": 8 }
```

**During a stream** a chip ("Searching the web…", "Reading page…") is shown while a server tool runs. **Afterwards** citations are normalized (`url_citation` → `{url, title, host}`, deduped, `javascript:` and non-http URLs dropped), stored on the assistant message as `annotations` so they survive reloads, and rendered as a numbered **Sources** list under the reply. `usage.server_tool_use.web_search_requests` is appended to the message meta line (e.g. `1,284 tokens • 2 web searches`).
