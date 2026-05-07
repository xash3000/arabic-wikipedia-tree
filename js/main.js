import { fetchAutocomplete, fetchRandomArticle, fetchArticleHTML } from './api.js';
import { findFirstValidLink } from './parser.js';
import { clearGraph, addNode, addEdge, graphNodes } from './graph.js';
import { setupRenderer } from './renderer.js';

const ui = {
    search: document.getElementById('search-input'),
    randomBtn: document.getElementById('random-btn'),
    clearBtn: document.getElementById('clear-btn'),
    autocompleteList: document.getElementById('autocomplete-list'),
    statusMessage: document.getElementById('status-message'),
    togglePanelBtn: document.getElementById('toggle-panel-btn'),
    uiLayer: document.getElementById('ui-layer')
};

let traceId = 0;
let isTracing = false;

// Setup Rendering/Canvas Loop
setupRenderer();

// --- Event Listeners ---
ui.search.addEventListener('input', handleSearchInput);
ui.randomBtn.addEventListener('click', handleRandomClick);
ui.clearBtn.addEventListener('click', () => {
    clearGraph();
    isTracing = false;
    traceId++;
    ui.statusMessage.textContent = 'تم مسح الشجرة.';
});
ui.togglePanelBtn.addEventListener('click', () => {
    ui.uiLayer.classList.toggle('minimized');
    if (ui.uiLayer.classList.contains('minimized')) {
        ui.togglePanelBtn.textContent = '+';
    } else {
        ui.togglePanelBtn.textContent = '-';
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-wrapper')) {
        ui.autocompleteList.classList.add('hidden');
    }
});

let debounceTimer;
function handleSearchInput(e) {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();
    if (query.length < 2) return renderAutocomplete([]);

    debounceTimer = setTimeout(async () => {
        try {
            const titles = await fetchAutocomplete(query);
            renderAutocomplete(titles);
        } catch (err) {
            console.error('Error fetching autocomplete:', err);
        }
    }, 300);
}

function renderAutocomplete(titles) {
    ui.autocompleteList.innerHTML = '';
    if (titles.length === 0) {
        ui.autocompleteList.classList.add('hidden');
        return;
    }

    titles.forEach(title => {
        const li = document.createElement('li');
        li.textContent = title;
        li.addEventListener('click', () => {
            ui.search.value = '';
            ui.autocompleteList.classList.add('hidden');
            startTracing(title);
        });
        ui.autocompleteList.appendChild(li);
    });
    ui.autocompleteList.classList.remove('hidden');
}

async function handleRandomClick() {
    ui.statusMessage.textContent = 'جاري جلب مقالة عشوائية...';
    try {
        const randomTitle = await fetchRandomArticle();
        if (randomTitle) {
            ui.search.value = '';
            ui.autocompleteList.classList.add('hidden');
            startTracing(randomTitle);
        }
    } catch (err) {
        console.error('Error fetching random article:', err);
        ui.statusMessage.textContent = 'حدث خطأ أثناء جلب المقالة العشوائية.';
    }
}

// --- Tracing Logic ---
async function startTracing(startTitle) {
    if (isTracing) {
        ui.statusMessage.textContent = 'الرجاء الانتظار حتى يكتمل البحث الحالي.';
        return;
    }

    isTracing = true;
    const currentTraceId = ++traceId;
    const searchColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

    let currentTitle = startTitle;
    let path = new Set();

    if (graphNodes[currentTitle] && Object.keys(graphNodes).length > 1) {
        ui.statusMessage.textContent = `المقالة موجودة بالفعل في الشجرة: ${currentTitle}`;
        isTracing = false;
        return;
    }

    addNode(currentTitle, searchColor);

    while (traceId === currentTraceId) {
        ui.statusMessage.textContent = `جاري جلب: ${currentTitle}...`;
        path.add(currentTitle);

        try {
            const result = await processArticle(currentTitle, searchColor, path);
            if (!result) break; // Finished, dead end, or loop found

            currentTitle = result;
            await new Promise(r => setTimeout(r, 600)); // Delay to be polite to Wikipedia API
        } catch (err) {
            console.error(err);
            ui.statusMessage.textContent = `حدث خطأ أثناء جلب: ${currentTitle}`;
            break;
        }
    }
    isTracing = false;
}

async function processArticle(currentTitle, searchColor, path) {
    const { html, resolvedTitle } = await fetchArticleHTML(currentTitle);

    if (resolvedTitle !== currentTitle) {
        addNode(resolvedTitle, searchColor);
        addEdge(currentTitle, resolvedTitle);
        currentTitle = resolvedTitle;
        path.add(currentTitle);
    }

    const nextArticle = findFirstValidLink(html);
    if (!nextArticle) {
        document.getElementById('status-message').textContent = `تم الوصول إلى طريق مسدود عند: ${currentTitle}`;
        return null;
    }

    const isNextEstablished = !!graphNodes[nextArticle];
    const isLoop = path.has(nextArticle);

    addNode(nextArticle, searchColor);
    addEdge(currentTitle, nextArticle);

    if (isLoop) {
        document.getElementById('status-message').textContent = `تم اكتشاف تكرار (حلقة) عند: ${nextArticle}`;
        return null;
    } else if (isNextEstablished) {
        document.getElementById('status-message').textContent = `تم الانضمام إلى مسار موجود عند: ${nextArticle}`;
        return null;
    }

    return nextArticle;
}
