'use strict';

const STOP_WORDS = new Set([
  'their', 'about', 'which', 'other', 'under', 'these', 'shall', 'where', 'section',
  'government', 'india', 'central', 'state', 'office', 'order', 'general', 'department', 'ministry'
]);

const APP_STATE = {
  docs: [],
  entities: {
    ministries: [],
    acts: []
  },
  tables: [],
  wordFreq: []
};

const SELECTORS = {
  docList: document.getElementById('doc-list'),
  tableList: document.getElementById('table-list'),
  searchInput: document.getElementById('search-input'),
  filterMinistry: document.getElementById('filter-ministry'),
  filterType: document.getElementById('filter-type'),
  searchStats: document.getElementById('search-stats'),
  searchResults: document.getElementById('search-results'),
  modal: document.getElementById('doc-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  modalCopy: document.getElementById('modal-copy'),
  modalClose: document.getElementById('modal-close')
};

async function init() {
  APP_STATE.docs = await loadDocuments();

  if (!APP_STATE.docs.length) {
    console.error('No data found.');
    safeSetText('doc-count', '0');
    safeSetText('doc-words', '0');
    safeSetText('doc-acts', '0');
    return;
  }

  analyzeContent();
  setupNavigation();
  setupSearch();
  setupModal();
  renderDashboard();
  renderAnalytics();
}

async function loadDocuments() {
  if (Array.isArray(window.APP_DATA) && window.APP_DATA.length) {
    return window.APP_DATA.map(normalizeDoc);
  }

  try {
    const resp = await fetch('extracted_data_enhanced.json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (!resp.ok) {
      throw new Error(`Data fetch failed: ${resp.status}`);
    }

    const payload = await resp.json();
    return Array.isArray(payload) ? payload.map(normalizeDoc) : [];
  } catch (error) {
    console.error('Failed to load extracted data.', error);
    return [];
  }
}

function normalizeDoc(doc) {
  const text = typeof doc?.text === 'string' ? doc.text : '';
  return {
    fileName: String(doc?.fileName ?? 'Untitled document'),
    text,
    lowerText: text.toLowerCase(),
    textLength: Number.isFinite(doc?.textLength) ? doc.textLength : text.length,
    tables: Array.isArray(doc?.tables) ? doc.tables : []
  };
}

function analyzeContent() {
  const allMinistries = [];
  const allActs = [];
  const allWords = [];
  const allTables = [];

  for (const doc of APP_STATE.docs) {
    const ministryMatches = doc.text.match(/Ministry\s+of\s+[A-Z][a-z]+(?:\s+(?:and|&)\s+)?[A-Z][a-z]+/g) ?? [];
    allMinistries.push(...ministryMatches);

    const actMatches = doc.text.match(/[A-Z][a-zA-Z\s]*\sAct(?:,\s+\d{4})?/g) ?? [];
    allActs.push(...actMatches);

    doc.tables.forEach((tableText, index) => {
      allTables.push({
        file: doc.fileName,
        id: index + 1,
        content: String(tableText)
      });
    });

    const words = doc.lowerText.match(/\b[a-z]{5,}\b/g) ?? [];
    allWords.push(...words.filter((word) => !STOP_WORDS.has(word)));
  }

  APP_STATE.entities.ministries = countFrequency(allMinistries);
  APP_STATE.entities.acts = countFrequency(allActs);
  APP_STATE.tables = allTables;
  APP_STATE.wordFreq = countFrequency(allWords).slice(0, 50);
}

function countFrequency(values) {
  const counts = new Map();

  for (const value of values) {
    const normalized = String(value).trim();
    if (normalized.length < 3) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function renderDashboard() {
  safeSetText('doc-count', String(APP_STATE.docs.length));

  const totalCharacters = APP_STATE.docs.reduce((sum, doc) => sum + doc.textLength, 0);
  safeSetText('doc-words', formatCompact(totalCharacters));
  safeSetText('doc-acts', String(APP_STATE.entities.acts.length));

  renderBarChart('ministryChart', APP_STATE.entities.ministries.slice(0, 8), 'Mentions');

  const typeCounts = countFrequency(APP_STATE.docs.map((doc) => detectType(doc.lowerText)));
  renderDoughnutChart('typeChart', typeCounts, 'Document Types');

  renderDocList(APP_STATE.docs);
}

function detectType(lowerText) {
  if (lowerText.includes('act,') || lowerText.includes('act 19') || lowerText.includes('act 20')) {
    return 'Acts & Rules';
  }
  if (lowerText.includes('report') || lowerText.includes('annual')) {
    return 'Reports';
  }
  return 'Notices & Others';
}

function renderDocList(docs) {
  if (!SELECTORS.docList) return;

  SELECTORS.docList.replaceChildren();

  for (const doc of docs) {
    const item = document.createElement('article');
    item.className = 'doc-item';
    item.tabIndex = 0;
    item.dataset.file = doc.fileName;

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'start';

    const title = document.createElement('h4');
    title.textContent = doc.fileName;

    const icon = document.createElement('div');
    icon.className = 'doc-icon';
    icon.style.opacity = '0.5';
    icon.style.fontSize = '1.5rem';
    icon.textContent = '📄';

    topRow.append(title, icon);

    const meta = document.createElement('div');
    meta.className = 'doc-meta';

    const size = document.createElement('span');
    size.textContent = `${(doc.textLength / 1024).toFixed(1)} KB`;

    const separator = document.createElement('span');
    separator.textContent = '•';

    const tableCount = document.createElement('span');
    tableCount.textContent = `${doc.tables.length} Tables`;

    meta.append(size, separator, tableCount);

    const button = document.createElement('button');
    button.className = 'btn-sm';
    button.type = 'button';
    button.textContent = 'Read Document';

    item.append(topRow, meta, button);
    SELECTORS.docList.appendChild(item);
  }

  SELECTORS.docList.addEventListener('click', handleDocListOpen);
  SELECTORS.docList.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleDocListOpen(event);
  });
}

function handleDocListOpen(event) {
  const target = event.target instanceof Element ? event.target.closest('.doc-item') : null;
  if (!target?.dataset.file) return;
  openModal(target.dataset.file);
}

function renderAnalytics() {
  renderWordChart();

  if (!SELECTORS.tableList) return;
  SELECTORS.tableList.replaceChildren();

  for (const table of APP_STATE.tables) {
    const item = document.createElement('div');
    item.className = 'table-item';

    const file = document.createElement('div');
    file.style.color = 'var(--accent)';
    file.style.fontWeight = '600';
    file.textContent = table.file;

    const meta = document.createElement('div');
    meta.style.color = 'var(--text-muted)';
    meta.style.fontSize = '0.85rem';
    meta.textContent = `Table #${table.id} - ${table.content.length} characters`;

    item.append(file, meta);
    SELECTORS.tableList.appendChild(item);
  }
}

function renderWordChart() {
  const ctx = document.getElementById('wordCloudChart');
  if (!ctx) return;

  const dataset = APP_STATE.wordFreq.slice(0, 20).map((word) => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    r: Math.min(word.count / 2, 30),
    label: word.name
  }));

  new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Keywords',
        data: dataset,
        backgroundColor: 'rgba(56, 189, 248, 0.6)',
        borderColor: '#38bdf8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.raw.label}: ${context.raw.r * 2}`
          }
        }
      },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

function setupNavigation() {
  const tabs = document.querySelectorAll('.sidebar li[data-tab]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar li').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
      document.getElementById(`${tab.dataset.tab}-view`)?.classList.add('active');
    });
  });
}

function setupSearch() {
  if (!SELECTORS.searchInput || !SELECTORS.filterMinistry || !SELECTORS.filterType || !SELECTORS.searchResults || !SELECTORS.searchStats) {
    return;
  }

  APP_STATE.entities.ministries.forEach((ministry) => {
    const option = document.createElement('option');
    option.value = ministry.name;
    option.textContent = `${ministry.name} (${ministry.count})`;
    SELECTORS.filterMinistry.appendChild(option);
  });

  const performSearch = debounce(() => {
    const query = SELECTORS.searchInput.value.trim().toLowerCase();
    const ministryFilter = SELECTORS.filterMinistry.value;
    const typeFilter = SELECTORS.filterType.value;

    if (query.length < 2 && !ministryFilter && !typeFilter) {
      SELECTORS.searchResults.replaceChildren();
      SELECTORS.searchStats.textContent = '';
      return;
    }

    const hits = APP_STATE.docs
      .filter((doc) => matchesFilters(doc, ministryFilter, typeFilter))
      .flatMap((doc) => buildSearchHit(doc, query));

    SELECTORS.searchStats.textContent = `${hits.length} results found`;
    renderSearchResults(hits);
  }, 150);

  SELECTORS.searchInput.addEventListener('input', performSearch);
  SELECTORS.filterMinistry.addEventListener('change', performSearch);
  SELECTORS.filterType.addEventListener('change', performSearch);
}

function matchesFilters(doc, ministryFilter, typeFilter) {
  if (ministryFilter && !doc.text.includes(ministryFilter)) return false;
  if (typeFilter === 'act' && !doc.lowerText.includes('act')) return false;
  if (typeFilter === 'report' && !doc.lowerText.includes('report') && !doc.lowerText.includes('annual')) return false;
  if (typeFilter === 'other' && (doc.lowerText.includes('act') || doc.lowerText.includes('report') || doc.lowerText.includes('annual'))) return false;
  return true;
}

function buildSearchHit(doc, query) {
  if (!query) return [{ file: doc.fileName, snippetNodes: [document.createTextNode('Document matches filters.')] }];

  const idx = doc.lowerText.indexOf(query);
  if (idx === -1) return [];

  const start = Math.max(0, idx - 60);
  const end = Math.min(doc.text.length, idx + query.length + 60);
  const snippet = doc.text.slice(start, end);

  return [{
    file: doc.fileName,
    snippetNodes: createHighlightedNodes(`...${snippet}...`, query)
  }];
}

function renderSearchResults(hits) {
  if (!SELECTORS.searchResults) return;
  SELECTORS.searchResults.replaceChildren();

  if (!hits.length) {
    const empty = document.createElement('div');
    empty.style.textAlign = 'center';
    empty.style.padding = '2rem';
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'No matches found.';
    SELECTORS.searchResults.appendChild(empty);
    return;
  }

  for (const hit of hits) {
    const item = document.createElement('article');
    item.className = 'search-result-item';
    item.style.cursor = 'pointer';
    item.tabIndex = 0;
    item.dataset.file = hit.file;

    const title = document.createElement('h5');
    title.textContent = hit.file;

    const paragraph = document.createElement('p');
    paragraph.append(...hit.snippetNodes);

    item.append(title, paragraph);
    SELECTORS.searchResults.appendChild(item);
  }

  SELECTORS.searchResults.addEventListener('click', handleSearchOpen);
  SELECTORS.searchResults.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleSearchOpen(event);
  });
}

function handleSearchOpen(event) {
  const target = event.target instanceof Element ? event.target.closest('.search-result-item') : null;
  if (!target?.dataset.file) return;
  openModal(target.dataset.file);
}

function createHighlightedNodes(text, query) {
  const escapedQuery = escapeRegExp(query);
  const regex = new RegExp(`(${escapedQuery})`, 'ig');
  return text.split(regex).map((part) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      const mark = document.createElement('mark');
      mark.textContent = part;
      return mark;
    }
    return document.createTextNode(part);
  });
}

function setupModal() {
  if (!SELECTORS.modal || !SELECTORS.modalClose || !SELECTORS.modalCopy || !SELECTORS.modalTitle || !SELECTORS.modalBody) {
    return;
  }

  SELECTORS.modalClose.addEventListener('click', closeModal);
  SELECTORS.modal.addEventListener('click', (event) => {
    if (event.target === SELECTORS.modal) closeModal();
  });

  SELECTORS.modalCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(SELECTORS.modalBody.innerText);
      alert('Copied to clipboard.');
    } catch {
      alert('Unable to copy text in this browser context.');
    }
  });
}

function openModal(fileName) {
  const doc = APP_STATE.docs.find((entry) => entry.fileName === fileName);
  if (!doc || !SELECTORS.modal || !SELECTORS.modalTitle || !SELECTORS.modalBody) return;

  SELECTORS.modalTitle.textContent = doc.fileName;
  SELECTORS.modalBody.replaceChildren();

  const fragments = doc.text.split('\n');
  for (const fragment of fragments) {
    if (!fragment.trim()) {
      SELECTORS.modalBody.appendChild(document.createElement('br'));
      continue;
    }

    const paragraph = document.createElement('p');
    paragraph.textContent = fragment;
    SELECTORS.modalBody.appendChild(paragraph);
  }

  SELECTORS.modal.classList.remove('hidden');
}

function closeModal() {
  SELECTORS.modal?.classList.add('hidden');
}

function renderBarChart(id, data, label) {
  const ctx = document.getElementById(id);
  if (!ctx) return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((item) => (item.name.length > 15 ? `${item.name.slice(0, 15)}...` : item.name)),
      datasets: [{
        label,
        data: data.map((item) => item.count),
        backgroundColor: 'rgba(56, 189, 248, 0.7)',
        borderRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderDoughnutChart(id, data) {
  const ctx = document.getElementById(id);
  if (!ctx) return;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map((item) => item.name),
      datasets: [{
        data: data.map((item) => item.count),
        backgroundColor: ['#38bdf8', '#818cf8', '#c084fc'],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } }
    }
  });
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(text);
}

function formatCompact(num) {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
}

function debounce(fn, delayMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

document.addEventListener('DOMContentLoaded', init);
