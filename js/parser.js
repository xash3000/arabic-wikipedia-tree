export function findValidLinks(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    cleanDocument(doc);
    const contentBody = doc.querySelector('.mw-parser-output') || doc.body;
    return extractLinksFromContent(contentBody);
}

function cleanDocument(doc) {
    const selectorsToRemove = [
        'table', '.infobox', '.navbox', '.mw-empty-elt',
        'sup.reference', 'i', 'em', '.thumb', '.hatnote', '#coordinates'
    ];
    selectorsToRemove.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => el.remove());
    });
}

function extractLinksFromContent(contentBody) {
    const paragraphs = contentBody.querySelectorAll('p, ul > li');
    const links = [];

    for (let p of paragraphs) {
        let parenthesesDepth = 0;
        const walker = document.createTreeWalker(
            p, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            { acceptNode: n => (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'A') ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT }
        );

        let currentNode = walker.nextNode();
        while (currentNode) {
            if (currentNode.nodeType === Node.TEXT_NODE) {
                parenthesesDepth = updateParenthesesDepth(currentNode.textContent, parenthesesDepth);
            } else if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.tagName === 'A') {
                if (parenthesesDepth === 0) {
                    const href = currentNode.getAttribute('href');
                    const title = currentNode.getAttribute('title');
                    if (href && href.startsWith('/wiki/') && title && !title.includes(':')) {
                        links.push(title);
                    }
                }
            }
            currentNode = walker.nextNode();
        }
    }
    return links;
}

function updateParenthesesDepth(text, currentDepth) {
    let depth = currentDepth;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '(' || char === '（') depth++;
        if ((char === ')' || char === '）') && depth > 0) depth--;
    }
    return depth;
}
