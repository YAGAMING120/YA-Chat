export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname.replace('/api/proxy/', '');
  const zenUrl = `https://opencode.ai/zen/v1/${path}${url.search}`;

  try {
    const headers = {};
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    headers['Content-Type'] = 'application/json';

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method === 'POST') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(zenUrl, fetchOptions);

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.status(response.status);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed' });
  }
}
