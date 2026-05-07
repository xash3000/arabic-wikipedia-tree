const API_BASE = 'https://ar.wikipedia.org/w/api.php';

// HTML Elements
const searchInput = document.getElementById('search-input');
const randomBtn = document.getElementById('random-btn');
const clearBtn = document.getElementById('clear-btn');
const togglePanelBtn = document.getElementById('toggle-panel-btn');
const uiLayer = document.getElementById('ui-layer');
const autocompleteList = document.getElementById('autocomplete-list');
const statusMessage = document.getElementById('status-message');
const canvas = document.getElementById('tree-canvas');
const ctx = canvas.getContext('2d');

// State
let debounceTimer;
let graphNodes = {}; // map title -> node object
let graphEdges = []; // array of {source, target}
let isSimulating = true;
let isTracing = false;
let traceId = 0;

// 1. Canvas Setup & Resize
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==========================================
// 2. Autocomplete Logic
// ==========================================
searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();

    if (query.length < 2) {
        autocompleteList.classList.add('hidden');
        autocompleteList.innerHTML = '';
        return;
    }

    debounceTimer = setTimeout(async () => {
        try {
            const url = `${API_BASE}?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json&origin=*`;
            const response = await fetch(url);
            const data = await response.json();

            const titles = data[1] || [];
            renderAutocomplete(titles);
        } catch (err) {
            console.error('Error fetching autocomplete:', err);
        }
    }, 300);
});

function renderAutocomplete(titles) {
    if (titles.length === 0) {
        autocompleteList.classList.add('hidden');
        return;
    }

    autocompleteList.innerHTML = '';
    titles.forEach(title => {
        const li = document.createElement('li');
        li.textContent = title;
        li.addEventListener('click', () => {
            searchInput.value = '';
            autocompleteList.classList.add('hidden');
            startTracing(title);
        });
        autocompleteList.appendChild(li);
    });

    autocompleteList.classList.remove('hidden');
}

randomBtn.addEventListener('click', async () => {
    try {
        statusMessage.textContent = 'جاري جلب مقالة عشوائية...';
        const url = `${API_BASE}?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.query && data.query.random && data.query.random.length > 0) {
            const randomTitle = data.query.random[0].title;
            searchInput.value = '';
            autocompleteList.classList.add('hidden');
            startTracing(randomTitle);
        }
    } catch (err) {
        console.error('Error fetching random article:', err);
        statusMessage.textContent = 'حدث خطأ أثناء جلب المقالة العشوائية.';
    }
});

clearBtn.addEventListener('click', () => {
    // Clear graph data
    graphNodes = {};
    graphEdges = [];
    isTracing = false;
    traceId++; // Cancel current trace
    statusMessage.textContent = 'تم مسح الشجرة.';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

togglePanelBtn.addEventListener('click', () => {
    uiLayer.classList.toggle('minimized');
    if (uiLayer.classList.contains('minimized')) {
        togglePanelBtn.textContent = '+';
    } else {
        togglePanelBtn.textContent = '-';
    }
});

// Close autocomplete on clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-wrapper')) {
        autocompleteList.classList.add('hidden');
    }
});

// ==========================================
// 3. Wikipedia Traversal Logic
// ==========================================

async function fetchArticleHTML(title) {
    const url = `${API_BASE}?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&redirects=1&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.info);
    }
    // Return both HTML and the resolved title (in case of redirects)
    return {
        html: data.parse.text['*'],
        resolvedTitle: data.parse.title
    };
}

function findFirstValidLink(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // Remove elements that might contain invalid links
    const selectorsToRemove = [
        'table',
        '.infobox',
        '.navbox',
        '.mw-empty-elt',
        'sup.reference',
        'i',
        'em',
        '.thumb',
        '.hatnote',
        '#coordinates'
    ];
    selectorsToRemove.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Content is usually in .mw-parser-output
    const contentBody = doc.querySelector('.mw-parser-output') || doc.body;

    // Iterate through paragraph children to find the first valid link
    // or sometimes lists (removed :scope due to mobile browser compatibility issues)
    const paragraphs = contentBody.querySelectorAll('p, ul > li');

    for (let p of paragraphs) {
        let parenthesesDepth = 0;

        // TreeWalker to iterate through text and link nodes
        const walker = document.createTreeWalker(
            p,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function (node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        return node.tagName === 'A' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                    }
                    return NodeFilter.FILTER_ACCEPT; // Accept text nodes
                }
            }
        );

        let currentNode = walker.nextNode();
        while (currentNode) {
            if (currentNode.nodeType === Node.TEXT_NODE) {
                // Update parentheses depth based on Arabic or English parens
                const text = currentNode.textContent;
                for (let i = 0; i < text.length; i++) {
                    if (text[i] === '(' || text[i] === '（') parenthesesDepth++;
                    if ((text[i] === ')' || text[i] === '）') && parenthesesDepth > 0) parenthesesDepth--;
                }
            } else if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.tagName === 'A') {
                if (parenthesesDepth === 0) {
                    const href = currentNode.getAttribute('href');
                    const title = currentNode.getAttribute('title');

                    // Valid links: inside /wiki/, not a special page
                    if (href && href.startsWith('/wiki/') && title && !title.includes(':')) {
                        return title;
                    }
                }
            }
            currentNode = walker.nextNode();
        }
    }
    return null; // No link found
}

async function startTracing(startTitle) {
    if (isTracing) {
        statusMessage.textContent = 'الرجاء الانتظار حتى يكتمل البحث الحالي.';
        return;
    }
    isTracing = true;
    const currentTraceId = ++traceId;

    const searchColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

    let currentTitle = startTitle;
    let path = new Set();

    if (graphNodes[currentTitle] && Object.keys(graphNodes).length > 1) {
        statusMessage.textContent = `المقالة موجودة بالفعل في الشجرة: ${currentTitle}`;
        isTracing = false;
        return;
    }

    // Add start node if not exists
    addNode(currentTitle, searchColor);

    while (true) {
        if (traceId !== currentTraceId) return; // Exit if cancelled

        statusMessage.textContent = `جاري جلب: ${currentTitle}...`;

        path.add(currentTitle);

        try {
            const { html, resolvedTitle } = await fetchArticleHTML(currentTitle);

            if (traceId !== currentTraceId) return; // Exit if cancelled

            // If redirected, handle the newly resolved title
            if (resolvedTitle !== currentTitle) {
                addNode(resolvedTitle, searchColor);
                addEdge(currentTitle, resolvedTitle);
                currentTitle = resolvedTitle;
                path.add(currentTitle);
            }

            const nextArticle = findFirstValidLink(html);

            if (!nextArticle) {
                statusMessage.textContent = `تم الوصول إلى طريق مسدود عند: ${currentTitle}`;
                break;
            }

            const isNextEstablished = !!graphNodes[nextArticle];
            const isLoop = path.has(nextArticle);

            addNode(nextArticle, searchColor);
            addEdge(currentTitle, nextArticle);

            if (isLoop) {
                statusMessage.textContent = `تم اكتشاف تكرار (حلقة) عند: ${nextArticle}`;
                break;
            } else if (isNextEstablished) {
                statusMessage.textContent = `تم الانضمام إلى مسار موجود عند: ${nextArticle}`;
                break;
            }

            currentTitle = nextArticle;

            // Small delay to be polite to Wikipedia API
            await new Promise(r => setTimeout(r, 600));

        } catch (err) {
            console.error(err);
            statusMessage.textContent = `حدث خطأ أثناء جلب: ${currentTitle}`;
            break;
        }
    }

    isTracing = false;
}

// ==========================================
// 4. Graph & Canvas Rendering Logic
// ==========================================

function addNode(title, color) {
    if (!graphNodes[title]) {
        // Start near center
        graphNodes[title] = {
            id: title,
            x: window.innerWidth / 2 + (Math.random() * 40 - 20),
            y: window.innerHeight / 2 + (Math.random() * 40 - 20),
            vx: 0,
            vy: 0,
            radius: 15,
            color: color || '#3498db'
        };
    }
}

function addEdge(source, target) {
    // Check if edge exists
    const exists = graphEdges.some(e => e.source.id === source && e.target.id === target);
    if (!exists) {
        graphEdges.push({
            source: graphNodes[source],
            target: graphNodes[target]
        });
    }
}

// ==========================================
// 5. Drag & Drop Interactivity
// ==========================================

let draggedNode = null;

function getEventPos(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX, y: clientY };
}

function pointerDown(e) {
    if (e.touches && e.touches.length > 1) return;
    const pos = getEventPos(e);
    const nodes = Object.values(graphNodes);

    // Iterate in reverse to pick top-most node
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = pos.x - n.x;
        const dy = pos.y - n.y;
        // Include interaction padding
        if (dx * dx + dy * dy <= (n.radius + 15) * (n.radius + 15)) {
            draggedNode = n;
            e.preventDefault(); // Prevent scrolling on mobile
            break;
        }
    }
}

function pointerMove(e) {
    if (draggedNode) {
        e.preventDefault(); // Prevent scrolling
        const pos = getEventPos(e);
        draggedNode.x = pos.x;
        draggedNode.y = pos.y;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
    }
}

function pointerUp(e) {
    draggedNode = null;
}

canvas.addEventListener('mousedown', pointerDown);
canvas.addEventListener('touchstart', pointerDown, { passive: false });

canvas.addEventListener('mousemove', pointerMove);
canvas.addEventListener('touchmove', pointerMove, { passive: false });

window.addEventListener('mouseup', pointerUp);
window.addEventListener('touchend', pointerUp);

function updatePhysics() {
    const nodes = Object.values(graphNodes);

    // Repulsion (Coulomb's law roughly)
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const n1 = nodes[i];
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < 40000) { // Limit repulsion radius
                const dist = Math.sqrt(distSq) || 0.1;
                const force = 1000 / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                n1.vx -= fx;
                n1.vy -= fy;
                n2.vx += fx;
                n2.vy += fy;
            }
        }
    }

    // Attraction (Springs along edges)
    const idealLength = 80;
    graphEdges.forEach(edge => {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

        const force = (dist - idealLength) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        edge.source.vx += fx;
        edge.source.vy += fy;
        edge.target.vx -= fx;
        edge.target.vy -= fy;
    });

    // Center gravity
    nodes.forEach(n => {
        // pull slowly towards center
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        n.vx += (cx - n.x) * 0.001;
        n.vy += (cy - n.y) * 0.001;

        // Apply velocity and dampen (friction)
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.85;
        n.vy *= 0.85;

        // Boundaries
        if (draggedNode !== n) {
            n.x = Math.max(n.radius, Math.min(window.innerWidth - n.radius, n.x));
            n.y = Math.max(n.radius, Math.min(window.innerHeight - n.radius, n.y));
        }
    });
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw edges
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 2;
    graphEdges.forEach(edge => {
        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
        ctx.stroke();

        // Draw directional arrow roughly
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const angle = Math.atan2(dy, dx);
        const targetRadius = edge.target.radius;

        const arrowX = edge.target.x - Math.cos(angle) * targetRadius;
        const arrowY = edge.target.y - Math.sin(angle) * targetRadius;

        ctx.fillStyle = '#7f8c8d';
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - 10 * Math.cos(angle - Math.PI / 6), arrowY - 10 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(arrowX - 10 * Math.cos(angle + Math.PI / 6), arrowY - 10 * Math.sin(angle + Math.PI / 6));
        ctx.fill();
    });

    // Draw nodes
    const nodes = Object.values(graphNodes);
    nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color || '#3498db';
        ctx.fill();
        ctx.strokeStyle = '#2980b9'; // You could also make this dynamic if needed
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw label
        ctx.fillStyle = '#2c3e50';
        ctx.font = '12px tahoma';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(n.id, n.x, n.y + n.radius + 5);
    });
}

function animate() {
    if (isSimulating) {
        updatePhysics();
    }
    draw();
    requestAnimationFrame(animate);
}

// Start animation loop
animate();
