import { graphNodes, graphEdges } from './graph.js';

const canvas = document.getElementById('tree-canvas');
const ctx = canvas.getContext('2d');

let isSimulating = true;
let draggedNode = null;

export function setupRenderer() {
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('touchstart', pointerDown, { passive: false });

    canvas.addEventListener('mousemove', pointerMove);
    canvas.addEventListener('touchmove', pointerMove, { passive: false });

    window.addEventListener('mouseup', pointerUp);
    window.addEventListener('touchend', pointerUp);

    animate();
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
}

function getEventPos(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX, y: clientY };
}

function pointerDown(e) {
    if (e.touches && e.touches.length > 1) return;
    const pos = getEventPos(e);
    const nodes = Object.values(graphNodes);

    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = pos.x - n.x;
        const dy = pos.y - n.y;
        if (dx * dx + dy * dy <= (n.radius + 15) * (n.radius + 15)) {
            draggedNode = n;
            e.preventDefault();
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

function updatePhysics() {
    const nodes = Object.values(graphNodes);

    // Repulsion (Coulomb's law)
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const n1 = nodes[i];
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < 40000) {
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 2;
    graphEdges.forEach(edge => {
        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
        ctx.stroke();

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

    const nodes = Object.values(graphNodes);
    nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color || '#3498db';
        ctx.fill();
        ctx.strokeStyle = '#2980b9';
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
