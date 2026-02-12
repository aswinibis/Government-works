const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY_BYTES = 1_000_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 45;
const rateStore = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function isRateLimited(req) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateStore.get(key) ?? { count: 0, expiresAt: now + RATE_WINDOW_MS };

  if (now > entry.expiresAt) {
    entry.count = 0;
    entry.expiresAt = now + RATE_WINDOW_MS;
  }

  entry.count += 1;
  rateStore.set(key, entry);
  return entry.count > RATE_LIMIT;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', reject);
  });
}

async function postJson(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, json };
  } catch {
    return { ok: false, status: 503, json: {} };
  }
}

function getSafeOllamaUrl(baseUrl) {
  try {
    const parsed = new URL(baseUrl || 'http://localhost:11434');
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return 'http://localhost:11434';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'http://localhost:11434';
  }
}

async function handleApi(req, res) {
  if (req.method !== 'POST') return false;

  if (req.url === '/api/ollama/models') {
    const body = await parseJsonBody(req);
    const baseUrl = getSafeOllamaUrl(body.baseUrl);
    const upstream = await postJson(`${baseUrl}/api/tags`, {});

    if (!upstream.ok) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unable to fetch models from local Ollama runtime.' }));
      return true;
    }

    const models = Array.isArray(upstream.json.models)
      ? upstream.json.models.map((item) => item.name).filter(Boolean)
      : [];

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ models }));
    return true;
  }

  if (req.url === '/api/analyze') {
    const body = await parseJsonBody(req);
    const prompt = String(body.prompt || '').slice(0, 6000);
    const documentText = String(body.documentText || '').slice(0, 90_000);
    const model = String(body.model || '').trim();
    const fileName = String(body.fileName || 'Uploaded PDF').slice(0, 180);

    if (!prompt || !documentText || !model) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'prompt, model and documentText are required.' }));
      return true;
    }

    const baseUrl = getSafeOllamaUrl(body.baseUrl);
    const wrappedPrompt = [
      `You are analyzing a government document file named: ${fileName}.`,
      'Give structured and accurate findings. Avoid hallucinations and quote only from provided text.',
      `User Task: ${prompt}`,
      '',
      'Document Content:',
      documentText
    ].join('\n');

    const upstream = await postJson(`${baseUrl}/api/generate`, {
      model,
      prompt: wrappedPrompt,
      stream: false,
      options: {
        temperature: 0.2
      }
    });

    if (!upstream.ok) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Ollama generation failed. Ensure model is available locally.' }));
      return true;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ analysis: upstream.json.response || '' }));
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);

  if (isRateLimited(req)) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }));
    return;
  }

  try {
    const handledApi = await handleApi(req, res);
    if (handledApi) return;
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message || 'Invalid request.' }));
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  const urlPath = (req.url || '/').split('?')[0];
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const normalized = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
  const absPath = path.join(__dirname, normalized);

  if (!absPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(absPath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
      return;
    }

    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.listen(PORT, () => {
  console.log(`Secure server running at http://localhost:${PORT}`);
  console.log('For local AI analysis, start Ollama with: ollama serve');
});
