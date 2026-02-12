# GovData Insight Dashboard (Local AI Edition)

A modernized government document analysis platform for securely exploring ministry PDFs and running **local AI analysis with Ollama**.

## What is new

- 📄 **Government PDF upload and parsing** in-browser using PDF.js.
- 🤖 **Local Ollama integration** for private, on-device analysis.
- 🧠 **Prompt-based analysis workflow**: upload document → choose model → run analysis.
- 🛡️ **Security hardening**:
  - Content Security Policy tuned for local Ollama access.
  - Secure HTTP response headers.
  - Basic API rate limiting and payload size caps.
  - Host allow-listing for Ollama URL (`localhost` / `127.0.0.1` only).
  - Path traversal protections for static file hosting.
- 🎨 **More interactive UI** with a dedicated AI Analysis workspace.

## Local setup

### 1) Start Ollama locally

```bash
ollama serve
ollama pull llama3
```

### 2) Start this website with the secure Node server

```bash
node server_setup.js
```

Then open:

- `http://localhost:8080`

## AI analysis flow

1. Open the **AI Analysis** tab.
2. Upload a government PDF.
3. Confirm the Ollama URL (default `http://localhost:11434`).
4. Pick a local model.
5. Enter your analysis prompt and run analysis.

> The PDF file itself is not uploaded to a remote server; text is extracted locally and sent to your local Ollama runtime.

## Project structure

- `index.html` – Dashboard and AI Analysis UI.
- `style.css` – Modern styles for dashboard + AI workflow.
- `script.js` – Client logic, analytics, PDF extraction, AI orchestration.
- `server_setup.js` – Secure static server + Ollama proxy API.
- `data.js` – Existing extracted government document dataset.

## Security notes

This is a local-first architecture meant for laptops/workstations. For production government deployments, add:

- authentication/authorization,
- audit logging,
- request signing,
- encrypted storage and backups,
- container hardening and vulnerability scanning,
- and formal compliance controls mandated by your department.
