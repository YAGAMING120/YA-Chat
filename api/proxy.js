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

  // Forward every query param except our own routing key (?path=) so callers
  // can pass filters like ?path=models&output_modalities=speech
  const target = new URL(`${OPENROUTER_BASE}/${path}`);
  url.searchParams.forEach((value, key) => {
    if (key !== 'path') target.searchParams.set(key, value);
  });

  try {
    const headers = {
      'Content-Type': 'application/json',
      // App attribution required by OpenRouter for ranked/analytics apps
      'HTTP-Referer': req.headers.origin || `https://${req.headers.host || 'localhost'}`,
      'X-Title': 'Blaze Chat'
    };
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const fetchOptions = { method: req.method, headers };

    if (req.method === 'POST') {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    }

    const response = await fetch(target, fetchOptions);

    const contentType = response.headers.get('content-type') || '';
    // Binary payloads (audio from /audio/speech, images) must reach the client
    // as raw bytes — decoding them as text would corrupt them.
    const isText = /^(text\/|application\/(json|xml|javascript)|image\/svg)/i.test(contentType) || contentType === '';

    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', contentType);
      res.status(response.status);
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
    } else if (isText) {
      res.setHeader('Content-Type', contentType || 'application/json');
      res.status(response.status);
      const text = await response.text();
      try {
        res.json(JSON.parse(text));
      } catch (e) {
        res.send(text);
      }
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.status(response.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: { message: 'Proxy request failed' } });
  }
}
