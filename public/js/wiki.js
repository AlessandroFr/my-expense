/**
 * Wiki SPA: scroll-spy + search filter + copy-link + expand/collapse details.
 * Caricato solo da src/Views/templates/wiki/index.php.
 */

const sections = Array.from(document.querySelectorAll('[data-wiki-section]'));
const allTocLinks = Array.from(document.querySelectorAll('.wiki-toc a[href^="#"], .wiki-toc-nav a[href^="#"]'));
const searchInput = document.getElementById('wiki-search');
const expandBtn = document.getElementById('wiki-expand-all');
const collapseBtn = document.getElementById('wiki-collapse-all');
const toastEl = document.getElementById('wiki-copy-toast');

/* ───── Scroll-spy: evidenzia la sezione corrente nel TOC ───── */
const linksById = new Map();
for (const a of allTocLinks) {
    const id = a.getAttribute('href').slice(1);
    if (!linksById.has(id)) linksById.set(id, []);
    linksById.get(id).push(a);
}

let currentActiveId = null;
function setActive(id) {
    if (id === currentActiveId) return;
    if (currentActiveId) {
        const prev = linksById.get(currentActiveId) || [];
        for (const a of prev) a.classList.remove('active');
    }
    const next = linksById.get(id) || [];
    for (const a of next) a.classList.add('active');
    currentActiveId = id;
    if (id) {
        try { history.replaceState(null, '', '#' + id); } catch (_) {}
    }
}

const observer = new IntersectionObserver((entries) => {
    /* Tra le sezioni intersecate, scegli quella piu' vicina al top del viewport. */
    const visible = entries
        .filter(e => e.isIntersecting)
        .map(e => ({ id: e.target.querySelector('h2[id]')?.id || null, top: e.boundingClientRect.top }))
        .filter(x => x.id);
    if (visible.length === 0) return;
    visible.sort((a, b) => Math.abs(a.top) - Math.abs(b.top));
    setActive(visible[0].id);
}, {
    rootMargin: '-90px 0px -55% 0px',
    threshold: [0, 0.1, 0.5, 1],
});
for (const s of sections) observer.observe(s);

/* All'apertura: se l'URL ha un anchor, marca attivo subito. */
if (location.hash) {
    const id = location.hash.slice(1);
    if (linksById.has(id)) {
        requestAnimationFrame(() => setActive(id));
    }
}

/* ───── Search filter sulle sezioni ───── */
let searchDebounce = 0;
function clearHighlights(root) {
    const marks = root.querySelectorAll('mark[data-wiki-mark]');
    for (const m of marks) {
        const txt = document.createTextNode(m.textContent);
        m.replaceWith(txt);
        m.parentNode?.normalize();
    }
}
function highlightIn(node, regex) {
    if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.nodeValue;
        if (!regex.test(txt)) return;
        regex.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0;
        let m;
        while ((m = regex.exec(txt)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
            const mark = document.createElement('mark');
            mark.setAttribute('data-wiki-mark', '1');
            mark.textContent = m[0];
            frag.appendChild(mark);
            last = m.index + m[0].length;
            if (m.index === regex.lastIndex) regex.lastIndex++;
        }
        if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
        node.replaceWith(frag);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === 'MARK' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE') return;
        for (const child of Array.from(node.childNodes)) highlightIn(child, regex);
    }
}
function applySearch(raw) {
    const q = raw.trim().toLowerCase();
    for (const s of sections) clearHighlights(s);
    if (q.length === 0) {
        for (const s of sections) s.style.display = '';
        return;
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    for (const s of sections) {
        const text = s.textContent.toLowerCase();
        const ok = tokens.every(t => text.includes(t));
        s.style.display = ok ? '' : 'none';
        if (ok) {
            const esc = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            const re = new RegExp('(' + esc + ')', 'gi');
            highlightIn(s, re);
        }
    }
}
if (searchInput) {
    searchInput.addEventListener('input', (ev) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => applySearch(ev.target.value), 150);
    });
    searchInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.target.value = '';
            applySearch('');
        }
    });
}

/* ───── Copy-link sulle ancore dei titoli ───── */
function showToast() {
    if (!toastEl) return;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 1600);
}
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast(); } catch (_) {}
    document.body.removeChild(ta);
}
document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.wiki-anchor-link');
    if (!btn) return;
    ev.preventDefault();
    const id = btn.dataset.anchor;
    if (!id) return;
    const url = location.origin + location.pathname + '#' + id;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(showToast).catch(() => fallbackCopy(url));
    } else {
        fallbackCopy(url);
    }
    try { history.replaceState(null, '', '#' + id); } catch (_) {}
});

/* ───── Espandi / comprimi tutti i <details> ───── */
function setAllDetails(open) {
    const all = document.querySelectorAll('.wiki-section details');
    for (const d of all) d.open = open;
}
expandBtn?.addEventListener('click', () => setAllDetails(true));
collapseBtn?.addEventListener('click', () => setAllDetails(false));

/* ───── Click su voce TOC: se la sezione e' nascosta da search, ripristina la vista. */
for (const a of allTocLinks) {
    a.addEventListener('click', () => {
        const id = a.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        if (target.closest('.wiki-section')?.style.display === 'none') {
            if (searchInput) {
                searchInput.value = '';
                applySearch('');
            }
        }
    });
}
