const API_BASE = 'https://ar.wikipedia.org/w/api.php';

export async function fetchAutocomplete(query) {
    const url = `${API_BASE}?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    return data[1] || [];
}

export async function fetchRandomArticle() {
    const url = `${API_BASE}?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    return data.query?.random?.[0]?.title || null;
}

export async function fetchArticleHTML(title) {
    const url = `${API_BASE}?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&redirects=1&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(data.error.info);

    return {
        html: data.parse.text['*'],
        resolvedTitle: data.parse.title
    };
}
