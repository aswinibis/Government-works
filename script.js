// script.js - v3.0 Enhanced for GovData

// Global State
let APP_STATE = {
    docs: [],
    entities: {
        ministries: [],
        departments: [],
        acts: []
    },
    tables: [],
    wordFreq: []
};

// --- Initialization ---

async function init() {
    console.log("Initializing GovData Dashboard v3.0...");

    // Check for Data
    if (window.APP_DATA) {
        APP_STATE.docs = window.APP_DATA;
    } else {
        try {
            const resp = await fetch('extracted_data_enhanced.json');
            if (!resp.ok) throw new Error("Data fetch failed");
            APP_STATE.docs = await resp.json();
            console.log("Data loaded via fetch");
        } catch (e) {
            console.error(e);
            // Fallback for demo/dev if data.js didn't load global
            if (typeof APP_DATA !== 'undefined') APP_STATE.docs = APP_DATA;
        }
    }

    if (!APP_STATE.docs.length) {
        console.error("No data found!");
        return;
    }

    analyzeContent();
    setupNavigation();
    setupSearch();
    setupModal();
    renderDashboard();
    renderAnalytics();

    // Remove loading indicators
    document.querySelectorAll('.stat-value').forEach(el => el.classList.remove('loading'));
}

// --- Analysis Engine ---

function analyzeContent() {
    let allMinistries = [];
    let allActs = [];
    let allWords = [];
    let allTables = [];

    APP_STATE.docs.forEach(doc => {
        const text = doc.text || "";

        // 1. Entities
        const ministryMatches = text.match(/Ministry\s+of\s+[A-Z][a-z]+(?:\s+(?:and|&)\s+)?[A-Z][a-z]+/g) || [];
        allMinistries.push(...ministryMatches);

        const actMatches = text.match(/[A-Z][a-zA-Z\s]*\sAct(?:,\s+\d{4})?/g) || [];
        allActs.push(...actMatches);

        // 2. Tables
        if (doc.tables && doc.tables.length > 0) {
            doc.tables.forEach((t, i) => {
                allTables.push({
                    file: doc.fileName,
                    id: i + 1,
                    content: t
                });
            });
        }

        // 3. Word Cloud Data (Simple stopword removal)
        const words = text.toLowerCase().match(/\b[a-z]{5,}\b/g) || [];
        const stopWords = ["their", "about", "which", "other", "under", "these", "shall", "where", "section", "government", "india", "central", "state", "office", "order", "general", "department", "ministry"];
        allWords.push(...words.filter(w => !stopWords.includes(w)));
    });

    APP_STATE.entities.ministries = countFrequency(allMinistries);
    APP_STATE.entities.acts = countFrequency(allActs);
    APP_STATE.tables = allTables;
    APP_STATE.wordFreq = countFrequency(allWords).slice(0, 50); // Top 50 words
}

function countFrequency(arr) {
    const counts = {};
    arr.forEach(item => {
        const clean = item.trim();
        if (clean.length > 2) {
            counts[clean] = (counts[clean] || 0) + 1;
        }
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
}

// --- Rendering ---

function renderDashboard() {
    // 1. KPI Cards
    safeSetText('doc-count', APP_STATE.docs.length);

    const totalWords = APP_STATE.docs.reduce((sum, d) => sum + (d.text ? d.text.length : 0), 0);
    safeSetText('doc-words', formatCompact(totalWords));

    safeSetText('doc-acts', APP_STATE.entities.acts.length);

    // 2. Main Chart: Ministries
    renderBarChart(
        'ministryChart',
        APP_STATE.entities.ministries.slice(0, 8),
        'Mentions'
    );

    // 3. Document Types Chart (by file content)
    const types = APP_STATE.docs.map(d => {
        const text = d.text.toLowerCase();
        if (text.includes("act,") || text.includes("act 19") || text.includes("act 20")) return "Acts & Rules";
        if (text.includes("report") || text.includes("annual")) return "Reports";
        return "Notices & Others";
    });
    const typeCounts = countFrequency(types);

    renderDoughnutChart(
        'typeChart',
        typeCounts,
        'Document Types'
    );

    // 4. Update Document List
    renderDocList(APP_STATE.docs);
}

function renderDocList(docs) {
    const docList = document.getElementById('doc-list');
    if (!docList) return;

    docList.innerHTML = docs.map(doc => `
        <div class="doc-item" onclick="openModal('${doc.fileName}')">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <h4>${doc.fileName}</h4>
                <div class="doc-icon" style="opacity:0.5; font-size:1.5rem;">📄</div>
            </div>
            <div class="doc-meta">
                <span>${(doc.textLength / 1024).toFixed(1)} KB</span>
                <span>•</span>
                <span>${doc.tables ? doc.tables.length : 0} Tables</span>
            </div>
            <button class="btn-sm">Read Document</button>
        </div>
    `).join('');
}

function renderAnalytics() {
    // 1. Word Cloud (Bubble Chart Proxy)
    const ctx = document.getElementById('wordCloudChart');
    if (ctx) {
        const data = APP_STATE.wordFreq.slice(0, 20).map(w => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
            r: Math.min(w.count / 2, 30), // Scale radius
            label: w.name
        }));

        new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: 'Keywords',
                    data: data,
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
                            label: (ctx) => ctx.raw.label + ": " + ctx.raw.r * 2 // Restore count approx
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

    // 2. Table Explorer
    const tableListContainer = document.getElementById('table-list');
    if (tableListContainer) {
        tableListContainer.innerHTML = APP_STATE.tables.map(t => `
            <div class="table-item" onclick="alert('Table Viewer coming in v3.1!')">
                <div style="color:var(--accent); font-weight:600;">${t.file}</div>
                <div style="color:var(--text-muted); font-size:0.85rem;">Table #${t.id} - ${t.content.length} characters</div>
            </div>
        `).join('');
    }
}

// --- Interaction ---

function setupNavigation() {
    const tabs = document.querySelectorAll('.sidebar li[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sidebar li').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            const viewId = tab.dataset.tab + '-view';
            const view = document.getElementById(viewId);
            if (view) view.classList.add('active');
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const filterMinistry = document.getElementById('filter-ministry');
    const filterType = document.getElementById('filter-type');
    const resultsContainer = document.getElementById('search-results');

    // Populate Filters
    if (filterMinistry) {
        APP_STATE.entities.ministries.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.innerText = `${m.name} (${m.count})`;
            filterMinistry.appendChild(opt);
        });
    }

    const performSearch = () => {
        const query = searchInput.value.toLowerCase();
        const ministryFilter = filterMinistry.value;
        const typeFilter = filterType.value;

        if (query.length < 2 && !ministryFilter && !typeFilter) {
            resultsContainer.innerHTML = '';
            document.getElementById('search-stats').innerText = '';
            return;
        }

        const hits = [];
        APP_STATE.docs.forEach(doc => {
            const text = doc.text.toLowerCase();

            // Apply Filters
            if (ministryFilter && !doc.text.includes(ministryFilter)) return;
            if (typeFilter === 'act' && !text.includes('act')) return;
            // (Simple type logic for demo)

            if (query && text.includes(query)) {
                // Snippet Logic
                let idx = text.indexOf(query);
                const start = Math.max(0, idx - 60);
                const end = Math.min(text.length, idx + query.length + 60);
                let snippet = doc.text.substring(start, end);

                // Highlight
                snippet = snippet.replace(new RegExp(query, 'gi'), match => `<mark>${match}</mark>`);

                hits.push({
                    file: doc.fileName,
                    snippet: "..." + snippet + "..."
                });
            } else if (!query) {
                // Filter only match
                hits.push({ file: doc.fileName, snippet: "Document matches filters." });
            }
        });

        document.getElementById('search-stats').innerText = `${hits.length} results found`;

        if (hits.length === 0) {
            resultsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted)">No matches found.</div>';
        } else {
            resultsContainer.innerHTML = hits.map(hit => `
                <div class="search-result-item" onclick="openModal('${hit.file}')" style="cursor:pointer">
                    <h5>${hit.file}</h5>
                    <p>${hit.snippet}</p>
                </div>
            `).join('');
        }
    };

    searchInput?.addEventListener('input', performSearch);
    filterMinistry?.addEventListener('change', performSearch);
    filterType?.addEventListener('change', performSearch);
}

// --- Modal System ---

function setupModal() {
    const modal = document.getElementById('doc-modal');
    const closeBtn = document.getElementById('modal-close');
    const copyBtn = document.getElementById('modal-copy');

    if (!modal) return;

    window.openModal = function (fileName) {
        const doc = APP_STATE.docs.find(d => d.fileName === fileName);
        if (!doc) return;

        document.getElementById('modal-title').innerText = doc.fileName;

        // Simple formatting: newlines to paragraphs
        const formattedText = doc.text.split('\n').map(para =>
            para.trim().length > 0 ? `<p>${para}</p>` : '<br>'
        ).join('');

        document.getElementById('modal-body').innerHTML = formattedText;
        modal.classList.remove('hidden');
    };

    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    copyBtn.addEventListener('click', () => {
        const text = document.getElementById('modal-body').innerText;
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    });
}

// --- Chart Wrappers ---

function renderBarChart(id, data, label) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.name.substring(0, 15) + '...'),
            datasets: [{
                label: label,
                data: data.map(d => d.count),
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

function renderDoughnutChart(id, data, label) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.name),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: ['#38bdf8', '#818cf8', '#c084fc'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } }
        }
    });
}

// --- Utilities ---

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function formatCompact(num) {
    return Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

// Start
document.addEventListener('DOMContentLoaded', init);

