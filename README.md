# YA Chat

A streaming chat UI for [OpenRouter](https://openrouter.ai) — hundreds of models behind one OpenAI-compatible API.

## Features

- Streaming responses (SSE) with live reasoning/thinking blocks
- Model picker with search, provider grouping, and a free-models filter (`:free` variants)
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
| `api/proxy.js` | Serverless proxy to `https://openrouter.ai/api/v1` (keeps request paths stable and adds app attribution headers) |
| `style/` | Stylesheets |

## Canvas protocol

Replies may include a `<canvas>` block that the client extracts before rendering:

```html
<canvas title="Readme" type="doc" action="replace">**Markdown** body</canvas>
<canvas title="Pricing card" type="code" lang="html" action="append"><div>…</div></canvas>
```

`type` is `doc` (markdown → editable document) or `code` (source, with `lang` and an optional live preview); `action` is `replace`, `append`, or `prepend`. When the panel is open, the current canvas content is injected into the system prompt so follow-up turns can edit it in place. Panel visibility is mutually exclusive with the artifact panel.
