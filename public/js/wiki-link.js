/**
 * wiki-link.js: aggiunge un piccolo link "? Guida" accanto al titolo H1 della
 * pagina corrente, se quel path ha una sezione corrispondente nella guida.
 * Non modifica i template dominio: agisce dal DOM lato client.
 */

const PATH_TO_ANCHOR = {
    '/':              'dashboard',
    '/dashboard':     'dashboard',
    '/expenses':      'spese',
    '/incomes':       'entrate',
    '/transfers':     'trasferimenti',
    '/recurring':     'ricorrenti',
    '/categories':    'categorie',
    '/budgets':       'budget',
    '/accounts':      'conti',
    '/contacts':      'anagrafiche',
    '/securities':    'investimenti',
    '/pac':           'pac',
    '/reports':       'report',
    '/settings':      'backup-restore',
};

function normalizePath() {
    const body = document.body;
    const base = (body?.dataset?.baseUrl || '').replace(/\/$/, '');
    let path = location.pathname || '/';
    if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
    /* Tronca eventuali sotto-path (es. /securities/instrument -> /securities). */
    const firstSegment = '/' + (path.split('/')[1] || '');
    return { full: path, root: firstSegment, base };
}

function init() {
    const { root, base } = normalizePath();
    const anchor = PATH_TO_ANCHOR[root] || null;
    if (!anchor) return;

    /* Siamo gia' sulla pagina wiki? Non aggiungere link. */
    if (root === '/wiki') return;

    /* Trova la prima H1 dentro <main>. Le pagine dominio usano sempre un h1.h3 in cima. */
    const main = document.querySelector('main') || document.body;
    const h1 = main.querySelector('h1');
    if (!h1) return;

    /* Non duplicare se ricaricato o se gia' presente. */
    if (h1.querySelector('.wiki-hint')) return;

    const link = document.createElement('a');
    link.href = base + '/wiki#' + anchor;
    link.className = 'wiki-hint text-muted ms-2';
    link.title = 'Apri la guida per questa pagina';
    link.style.fontSize = '0.75em';
    link.style.fontWeight = '500';
    link.style.textDecoration = 'none';
    link.style.whiteSpace = 'nowrap';
    link.innerHTML = '<i class="bi bi-question-circle"></i> Guida';
    /* Aggiungi spazio e accodalo dentro l'H1 (sta in linea con il titolo). */
    h1.appendChild(document.createTextNode(' '));
    h1.appendChild(link);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
