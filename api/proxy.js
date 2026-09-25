const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const path = (url.searchParams.get('path') || '').replace(/^\/+/, '');

  if (!/^[a-zA-Z0-9_\-./]+$/.test(path) || path.split('/').includes('..')) {
    return res.status(400).json({ error: { message: 'Invalid API path' } });
  }

  const target = `${OPENROUTER_BASE}/${path}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
      // App attribution required by OpenRouter for ranked/analytics apps
      'HTTP-Referer': req.headers.origin || `https://${req.headers.host || 'localhost'}`,
      'X-Title': 'YA Chat'
    };
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const fetchOptions = { method: req.method, headers };

    if (req.method === 'POST') {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    }

    const response = await fetch(target, fetchOptions);

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.status(response.status);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else {
      const text = await response.text();
      try {
        res.json(JSON.parse(text));
      } catch (e) {
        res.send(text);
      }
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: { message: 'Proxy request failed' } });
  }
}
