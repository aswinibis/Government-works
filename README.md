# GovData Insight (Secure Local PDF + Ollama Analysis)

GovData Insight has been redeveloped into a **local-first government document analysis platform**. You can upload government PDFs, extract text locally, and query an Ollama model running on your laptop.

## What is new

- Secure backend API for upload + analysis workflow (`/api/upload`, `/api/analyze`, `/api/health`).
- PDF validation with extension check, magic header check, body size limit (15 MB), and filename sanitization.
- Local Ollama integration through configurable endpoint (`OLLAMA_URL`) and model (`OLLAMA_MODEL`).
- Modernized UI with a guided 2-step flow:
  1. Upload a government PDF.
  2. Ask AI questions against the extracted content.
- Additional server hardening:
  - Basic in-memory rate limiting.
  - Secure HTTP headers (`X-Frame-Options`, `X-Content-Type-Options`, `COOP`, etc.).
  - Path traversal protection for static files.

## Architecture

- **Frontend:** `index.html`, `style.css`, `script.js`
- **Backend:** `server_setup.js` (Node.js native HTTP server)
- **Seed data:** `data.js` (legacy extracted data shown in dashboard chart)

## Requirements

- Node.js 18+
- Ollama running locally (default: `http://127.0.0.1:11434`)
- Recommended for text extraction: `pdftotext` (from `poppler-utils`)

If `pdftotext` is not installed, uploads still work and analysis can run, but extraction quality is limited.

## Run locally

```bash
node server_setup.js
```

Open:

```text
http://localhost:8080
```

## Ollama setup example

```bash
ollama serve
ollama pull llama3.1:8b
```

Optional env config:

```bash
OLLAMA_URL=http://127.0.0.1:11434 OLLAMA_MODEL=llama3.1:8b node server_setup.js
```

## API summary

### `GET /api/health`
Returns backend health, selected model, and upload count.

### `POST /api/upload`
JSON body:

```json
{
  "fileName": "budget_report.pdf",
  "contentBase64": "<base64_data>"
}
```

### `POST /api/analyze`
JSON body:

```json
{
  "documentId": "<id_from_upload>",
  "question": "Summarize key fiscal policy changes"
}
```

## Notes

- This is designed for local/offline-adjacent workflows where government data should stay on controlled infrastructure.
- For production deployment, plug in persistent storage, authN/authZ, malware scanning, and structured audit logs.
