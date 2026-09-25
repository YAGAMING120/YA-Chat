# YA Chat

A streaming chat UI for [OpenRouter](https://openrouter.ai) — hundreds of models behind one OpenAI-compatible API.

## Features

- Streaming responses (SSE) with live reasoning/thinking blocks
- Model picker with search, provider grouping, and a free-models filter (`:free` variants)
- Chat history, projects, system prompts, attachments (images, PDF, text)
- Artifact panel with live code preview

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
| `api/proxy.js` | Serverless proxy to `https://openrouter.ai/api/v1` (keeps request paths stable and adds app attribution headers) |
| `style/` | Stylesheets |
