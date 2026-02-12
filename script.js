'use strict';

const state = {
  seedDocuments: Array.isArray(window.APP_DATA) ? window.APP_DATA : [],
  uploads: [],
  health: null
};

const ui = {
  healthPill: document.getElementById('health-pill'),
  seedDocCount: document.getElementById('seed-doc-count'),
  uploadedCount: document.getElementById('uploaded-count'),
  modelName: document.getElementById('model-name'),
  keywordsChart: document.getElementById('keywordsChart'),
  uploadForm: document.getElementById('upload-form'),
  pdfInput: document.getElementById('pdf-input'),
  uploadStatus: document.getElementById('upload-status'),
  uploadList: document.getElementById('upload-list'),
  qaForm: document.getElementById('qa-form'),
  documentSelect: document.getElementById('document-select'),
  questionInput: document.getElementById('question-input'),
  aiStatus: document.getElementById('ai-status'),
  aiAnswer: document.getElementById('ai-answer')
};

document.addEventListener('DOMContentLoaded', () => {
  renderSeedStats();
  renderKeywordsChart();
  bindUploadFlow();
  bindQaFlow();
  checkHealth();
});

function renderSeedStats() {
  ui.seedDocCount.textContent = String(state.seedDocuments.length);
  ui.uploadedCount.textContent = String(state.uploads.length);
}

function renderKeywordsChart() {
  if (!ui.keywordsChart || typeof Chart === 'undefined') return;

  const words = new Map();

  for (const doc of state.seedDocuments) {
    const text = String(doc?.text || '').toLowerCase();
    const chunks = text.match(/\b[a-z]{5,}\b/g) || [];
    for (const chunk of chunks) {
      if (chunk === 'government' || chunk === 'india') continue;
      words.set(chunk, (words.get(chunk) || 0) + 1);
    }
  }

  const top = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  new Chart(ui.keywordsChart, {
    type: 'bar',
    data: {
      labels: top.map(([word]) => word),
      datasets: [{
        data: top.map(([, count]) => count),
        label: 'Keyword Mentions',
        backgroundColor: '#6aa7ff'
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#d8def6' } },
        x: { ticks: { color: '#d8def6' } }
      }
    }
  });
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    state.health = await response.json();
    ui.healthPill.className = 'pill success';
    ui.healthPill.textContent = `Backend connected • ${state.health.status}`;
    ui.modelName.textContent = state.health.model || '-';
  } catch {
    ui.healthPill.className = 'pill danger';
    ui.healthPill.textContent = 'Backend unavailable. Start server_setup.js.';
    ui.modelName.textContent = 'Unavailable';
  }
}

function bindUploadFlow() {
  ui.uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const file = ui.pdfInput.files?.[0];
    if (!file) return setStatus(ui.uploadStatus, 'Select a PDF before upload.', 'danger');

    if (file.size > 15 * 1024 * 1024) {
      return setStatus(ui.uploadStatus, 'File exceeds 15 MB upload policy.', 'danger');
    }

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return setStatus(ui.uploadStatus, 'Only PDF files are allowed.', 'danger');
    }

    try {
      setStatus(ui.uploadStatus, 'Uploading and extracting...', 'warning');
      const contentBase64 = await fileToBase64(file);
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentBase64 })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Upload failed');

      state.uploads.unshift(payload);
      refreshUploadViews();
      setStatus(ui.uploadStatus, `Uploaded ${payload.fileName} (${payload.extractedCharacters} extracted chars).`, 'success');
      ui.uploadForm.reset();
    } catch (error) {
      setStatus(ui.uploadStatus, error.message || 'Upload failed.', 'danger');
    }
  });
}

function bindQaFlow() {
  ui.qaForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const documentId = ui.documentSelect.value;
    const question = ui.questionInput.value.trim();

    if (!documentId || !question) {
      return setStatus(ui.aiStatus, 'Choose a document and enter a question.', 'danger');
    }

    try {
      setStatus(ui.aiStatus, 'Running analysis with Ollama...', 'warning');
      ui.aiAnswer.textContent = '';

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, question })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analysis failed');

      setStatus(ui.aiStatus, `Analysis complete with ${payload.model}.`, 'success');
      ui.aiAnswer.textContent = payload.answer;
    } catch (error) {
      setStatus(ui.aiStatus, error.message || 'Analysis failed.', 'danger');
    }
  });
}

function refreshUploadViews() {
  ui.uploadedCount.textContent = String(state.uploads.length);
  ui.uploadList.replaceChildren();

  const firstOption = document.createElement('option');
  firstOption.value = '';
  firstOption.textContent = 'Select uploaded PDF';
  ui.documentSelect.replaceChildren(firstOption);

  for (const upload of state.uploads) {
    const card = document.createElement('article');
    card.className = 'upload-card';

    const title = document.createElement('h4');
    title.textContent = upload.fileName;

    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `${formatBytes(upload.size)} • ${upload.extractedCharacters} chars extracted`;

    const keywords = document.createElement('p');
    keywords.className = 'muted';
    keywords.textContent = `Top keywords: ${(upload.summary?.topKeywords || []).slice(0, 5).map((item) => item.word).join(', ') || 'n/a'}`;

    card.append(title, meta, keywords);
    ui.uploadList.appendChild(card);

    const option = document.createElement('option');
    option.value = upload.id;
    option.textContent = upload.fileName;
    ui.documentSelect.appendChild(option);
  }
}

function setStatus(target, message, variant) {
  target.className = `status-block ${variant}`;
  target.textContent = message;
}

function formatBytes(value) {
  return Intl.NumberFormat('en-US', { maximumFractionDigits: 1, notation: 'compact' }).format(value) + 'B';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}
