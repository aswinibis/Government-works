'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 8080);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const ALLOWED_FILE_EXTENSIONS = new Set(['.pdf']);
const UPLOADS_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

const uploadStore = new Map();
const requestTimestamps = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

const server = http.createServer(async (req, res) => {
  try {
    if (!isRateAllowed(req.socket.remoteAddress || 'unknown')) {
      sendJson(res, 429, { error: 'Too many requests. Please retry in a minute.' });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        ollamaUrl: OLLAMA_URL,
        model: OLLAMA_MODEL,
        uploads: uploadStore.size
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/upload') {
      const payload = await readJsonBody(req, MAX_UPLOAD_BYTES);
      const result = await saveUpload(payload);
      sendJson(res, 201, result);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/analyze') {
      const payload = await readJsonBody(req, 3 * 1024 * 1024);
      const result = await analyzeWithOllama(payload);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    const safeMessage = statusCode >= 500 ? 'Internal server error' : error.message;
    sendJson(res, statusCode, { error: safeMessage });
  }
});

function isRateAllowed(ipAddress) {
  const now = Date.now();
  const recent = requestTimestamps.get(ipAddress) || [];
  const bounded = recent.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (bounded.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestTimestamps.set(ipAddress, bounded);
    return false;
  }

  bounded.push(now);
  requestTimestamps.set(ipAddress, bounded);
  return true;
}

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendJson(res, statusCode, payload) {
  setCommonHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    const error = new Error('Only application/json is accepted');
    error.statusCode = 415;
    throw error;
  }

  try {
    const bodyString = Buffer.concat(chunks).toString('utf-8');
    return bodyString ? JSON.parse(bodyString) : {};
  } catch {
    const error = new Error('Malformed JSON payload');
    error.statusCode = 400;
    throw error;
  }
}

async function saveUpload(payload) {
  const fileName = sanitizeFileName(payload?.fileName);
  const base64 = typeof payload?.contentBase64 === 'string' ? payload.contentBase64.trim() : '';

  if (!fileName || !base64) {
    const error = new Error('fileName and contentBase64 are required');
    error.statusCode = 400;
    throw error;
  }

  const extension = path.extname(fileName).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
    const error = new Error('Only PDF files are accepted');
    error.statusCode = 400;
    throw error;
  }

  const fileBuffer = Buffer.from(base64, 'base64');
  if (!fileBuffer.length) {
    const error = new Error('Uploaded file is empty');
    error.statusCode = 400;
    throw error;
  }

  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    const error = new Error('PDF exceeds 15 MB upload limit');
    error.statusCode = 413;
    throw error;
  }

  if (!hasPdfMagicHeader(fileBuffer)) {
    const error = new Error('Uploaded content is not a valid PDF');
    error.statusCode = 400;
    throw error;
  }

  const docId = randomUUID();
  const onDiskName = `${docId}.pdf`;
  const onDiskPath = path.join(UPLOADS_DIR, onDiskName);
  await fs.promises.writeFile(onDiskPath, fileBuffer, { flag: 'wx' });

  const extractedText = await extractPdfText(onDiskPath);
  const summary = buildLocalSummary(extractedText);

  uploadStore.set(docId, {
    id: docId,
    fileName,
    filePath: onDiskPath,
    size: fileBuffer.length,
    uploadedAt: new Date().toISOString(),
    text: extractedText,
    summary
  });

  return {
    id: docId,
    fileName,
    size: fileBuffer.length,
    summary,
    extractedCharacters: extractedText.length
  };
}

function sanitizeFileName(rawFileName) {
  if (typeof rawFileName !== 'string') return '';
  const normalized = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  return normalized.slice(0, 120);
}

function hasPdfMagicHeader(buffer) {
  return buffer.subarray(0, 4).toString('utf-8') === '%PDF';
}

async function extractPdfText(pdfPath) {
  const command = 'pdftotext';
  const args = ['-enc', 'UTF-8', pdfPath, '-'];

  try {
    const text = await runCommand(command, args, 15_000);
    return text.slice(0, 200_000);
  } catch {
    return 'Automatic extraction unavailable (pdftotext not installed). Please install poppler-utils for richer extraction.';
  }
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timeout: ${command}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `Command exited with code ${code}`));
    });
  });
}

function buildLocalSummary(text) {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const counts = new Map();

  for (const word of words) {
    if (word.length < 4) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const keywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  return {
    topKeywords: keywords,
    characterCount: text.length
  };
}

async function analyzeWithOllama(payload) {
  const documentId = String(payload?.documentId || '').trim();
  const question = String(payload?.question || '').trim();

  if (!documentId || !question) {
    const error = new Error('documentId and question are required');
    error.statusCode = 400;
    throw error;
  }

  const doc = uploadStore.get(documentId);
  if (!doc) {
    const error = new Error('Unknown documentId. Upload first.');
    error.statusCode = 404;
    throw error;
  }

  const prompt = [
    'You are an assistant helping with government PDF analysis.',
    'Return concise and factual output with a short bullet list of key points.',
    '',
    `Question: ${question}`,
    '',
    'Document excerpt:',
    doc.text.slice(0, 25_000)
  ].join('\n');

  const ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_ctx: 4096
      }
    })
  });

  if (!ollamaResponse.ok) {
    const text = await ollamaResponse.text();
    const error = new Error(`Failed to call Ollama: ${ollamaResponse.status} ${text}`);
    error.statusCode = 502;
    throw error;
  }

  const payloadJson = await ollamaResponse.json();
  const answer = typeof payloadJson?.response === 'string' ? payloadJson.response : 'No answer returned by model.';

  return {
    documentId,
    question,
    answer,
    model: OLLAMA_MODEL
  };
}

function serveStatic(req, res) {
  const cleanedPath = req.url.split('?')[0];
  const rawPath = cleanedPath === '/' ? '/index.html' : cleanedPath;
  const safePath = path.normalize(rawPath).replace(/^\.+/, '');
  const absPath = path.join(__dirname, safePath);

  if (!absPath.startsWith(__dirname)) {
    sendJson(res, 403, { error: 'Access denied' });
    return;
  }

  fs.stat(absPath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      sendJson(res, 404, { error: `Not found: ${cleanedPath}` });
      return;
    }

    const extension = path.extname(absPath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    setCommonHeaders(res);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', extension === '.html' ? 'no-cache' : 'public, max-age=120');

    const stream = fs.createReadStream(absPath);
    stream.on('error', () => {
      sendJson(res, 500, { error: 'Failed to read file' });
    });
    stream.pipe(res);
  });
}

server.listen(PORT, () => {
  console.log(`GovData Insight server running at http://localhost:${PORT}`);
  console.log(`Ollama endpoint: ${OLLAMA_URL} | Model: ${OLLAMA_MODEL}`);
});
