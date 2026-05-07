export let graphNodes = {};
export let graphEdges = [];

export function clearGraph() {
    graphNodes = {};
    graphEdges = [];
}

export function addNode(title, color) {
    if (!graphNodes[title]) {
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
    return graphNodes[title];
}

export function addEdge(source, target) {
    const exists = graphEdges.some(e => e.source.id === source && e.target.id === target);
    if (!exists) {
        graphEdges.push({
            source: graphNodes[source],
            target: graphNodes[target]
        });
    }
}
