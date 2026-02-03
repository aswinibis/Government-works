// script.js - v2.0 Enhanced for GovData

// Global State
let APP_STATE = {
    docs: [],
    entities: {
        ministries: [],
        departments: [],
        acts: []
    }
};

// --- Initialization ---

async function init() {
    console.log("Initializing GovData Dashboard...");

    // Check for Data
    if (window.APP_DATA) {
        APP_STATE.docs = window.APP_DATA;
    } else {
        try {
            const resp = await fetch('extracted_data_enhanced.json');
            if (!resp.ok) throw new Error("Data fetch failed");
            APP_STATE.docs = await resp.json();
        } catch (e) {
            console.error(e);
            alert("Error loading data. Please ensure extracted_data_enhanced.json or data.js exists.");
            return;
        }
    }

    console.log(`Loaded ${APP_STATE.docs.length} documents.`);

    analyzeContent();
    setupNavigation();
    setupSearch();
    renderDashboard();

    // Remove loading indicators
    document.querySelectorAll('.stat-value').forEach(el => el.classList.remove('loading'));
}

// --- Analysis Engine ---

function analyzeContent() {
    let allMinistries = [];
    let allDepartments = [];
    let allActs = [];

    APP_STATE.docs.forEach(doc => {
        const text = doc.text || "";

        // 1. Extract Ministries (e.g. "Ministry of Finance")
        const ministryMatches = text.match(/Ministry\s+of\s+[A-Z][a-z]+(?:\s+(?:and|&)\s+)?[A-Z][a-z]+/g) || [];
        allMinistries.push(...ministryMatches);

        // 2. Extract Departments (e.g. "Department of Revenue")
        const deptMatches = text.match(/Department\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
        allDepartments.push(...deptMatches);

        // 3. Extract Acts (e.g. "The Companies Act, 2013")
        // Regex: Capitalized words followed by "Act" and optionally a year
        const actMatches = text.match(/[A-Z][a-zA-Z\s]*\sAct(?:,\s+\d{4})?/g) || [];
        allActs.push(...actMatches);
    });

    // Deduplicate and Frequency Count
    APP_STATE.entities.ministries = countFrequency(allMinistries);
    APP_STATE.entities.departments = countFrequency(allDepartments);
    APP_STATE.entities.acts = countFrequency(allActs);
}

function countFrequency(arr) {
    const counts = {};
    arr.forEach(item => {
        const clean = item.trim();
        if (clean.length > 5) { // Filter noise
            counts[clean] = (counts[clean] || 0) + 1;
        }
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1]) // Sort by frequency desc
        .map(([name, count]) => ({ name, count }));
}

// --- Rendering ---

function renderDashboard() {
    // 1. KPI Cards
    document.getElementById('doc-count').innerText = APP_STATE.docs.length;

    const totalWords = APP_STATE.docs.reduce((sum, d) => sum + (d.text ? d.text.length / 6 : 0), 0);
    document.getElementById('word-count').innerText = formatCompact(totalWords);

    const uniqueActs = APP_STATE.entities.acts.length;
    document.getElementById('topic-count').innerText = uniqueActs; // "Active Acts"
    document.querySelector('.stat-card:nth-child(3) h3').innerText = "Legislative Acts Found";

    // 2. Main Chart: Ministries Mentioned
    renderBarChart(
        'mainChart',
        APP_STATE.entities.ministries.slice(0, 10),
        'Top Ministries Refrenced'
    );

    // 3. Secondary Chart: Document Word Count
    renderPieChart(
        'keywordChart',
        APP_STATE.docs.map(d => ({ name: d.fileName, count: d.textLength })),
        'Document Size Distribution'
    );

    // 4. Update Document List (in Documents tab)
    const docList = document.getElementById('doc-list');
    docList.innerHTML = APP_STATE.docs.map(doc => `
        <div class="doc-item">
            <div class="doc-icon">📄</div>
            <div class="doc-info">
                <h4>${doc.fileName}</h4>
                <div class="meta">
                    <span>${(doc.textLength / 1024).toFixed(1)} KB Text</span>
                    <span>•</span>
                    <span>${doc.tables ? doc.tables.length : 0} Tables</span>
                </div>
            </div>
            <button class="btn btn-sm" onclick="viewDocument('${doc.fileName}')">Explore</button>
        </div>
    `).join('');
}

// --- Charts ---

function renderBarChart(canvasId, data, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.name.substring(0, 20) + '...'),
            datasets: [{
                label: 'Mentions',
                data: data.map(d => d.count),
                backgroundColor: 'rgba(56, 189, 248, 0.6)',
                borderColor: '#38bdf8',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: label, color: '#94a3b8' }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderPieChart(canvasId, data, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.name.substring(0, 15) + '..'),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: [
                    '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb7185'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 12 } },
                title: { display: true, text: label, color: '#94a3b8' }
            }
        }
    });
}

// --- Interaction ---

function setupNavigation() {
    const tabs = document.querySelectorAll('.sidebar li[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // UI Update
            document.querySelectorAll('.sidebar li').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            const viewId = tab.dataset.tab + '-view';
            document.getElementById(viewId).classList.add('active');
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');

    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length < 3) {
            resultsContainer.innerHTML = '<div class="empty-state">Type at least 3 characters...</div>';
            return;
        }

        const hits = [];
        APP_STATE.docs.forEach(doc => {
            const text = doc.text.toLowerCase();
            let idx = text.indexOf(query);
            if (idx !== -1) {
                // Get context
                const start = Math.max(0, idx - 40);
                const end = Math.min(text.length, idx + query.length + 40);
                const snippet = doc.text.substring(start, end).replace(new RegExp(query, 'gi'), match => `<mark>${match}</mark>`);

                hits.push({
                    file: doc.fileName,
                    snippet: "..." + snippet + "..."
                });
            }
        });

        if (hits.length === 0) {
            resultsContainer.innerHTML = '<div class="empty-state">No matches found.</div>';
        } else {
            resultsContainer.innerHTML = hits.map(hit => `
                <div class="search-result-item">
                    <h5>${hit.file}</h5>
                    <p>${hit.snippet}</p>
                </div>
            `).join('');
        }
    });
}

window.viewDocument = function (fileName) {
    const doc = APP_STATE.docs.find(d => d.fileName === fileName);
    if (!doc) return;

    const preview = document.getElementById('doc-preview');
    const textEl = document.getElementById('preview-text');

    textEl.innerHTML = `<pre>${doc.text.substring(0, 5000)}...\n\n(Truncated for performance)</pre>`;
    preview.classList.remove('hidden');

    // Auto-scroll to preview
    preview.scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('close-preview')?.addEventListener('click', () => {
    document.getElementById('doc-preview').classList.add('hidden');
});

// Utilities
function formatCompact(num) {
    return Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

// Start
document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init(); // Safe retry
}
