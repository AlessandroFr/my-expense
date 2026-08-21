// ─── icon-picker.js ───────────────────────────────────────────────────────
// Bootstrap Icons picker. Auto-attaches to any `<input data-icon-picker>` and
// turns it into an input-group with a live preview + a "browse" button that
// opens a modal containing a searchable grid of all Bootstrap Icons.
//
// Icon list is extracted at runtime from the local Bootstrap Icons CSS file
// and cached in localStorage, so the file is read only on the first open.
//
// Usage in HTML:
//   <input type="text" name="icon" class="form-control" data-icon-picker>
//
// The input value stored is the full class name (e.g. "bi-cart") to match
// existing data already in DB. Display is via a live <i class="bi bi-X"> preview.
// ──────────────────────────────────────────────────────────────────────────

const BI_VERSION = '1.11.3';
const CACHE_KEY = 'mx-bi-names';
const CSS_URL = '/vendor/bootstrap-icons/bootstrap-icons.min.css';

let iconNamesPromise = null;

function loadIconNames() {
    if (iconNamesPromise) return iconNamesPromise;

    iconNamesPromise = (async () => {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                if (data && data.version === BI_VERSION && Array.isArray(data.names) && data.names.length > 0) {
                    return data.names;
                }
            }
        } catch (_) {}

        let css = '';
        try {
            for (const sheet of document.styleSheets) {
                if (sheet.href && sheet.href.includes('bootstrap-icons')) {
                    try {
                        for (const rule of sheet.cssRules || []) {
                            css += rule.cssText + '\n';
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}

        if (!css) {
            const res = await fetch(CSS_URL, { credentials: 'omit' });
            if (!res.ok) throw new Error('Failed to load Bootstrap Icons CSS');
            css = await res.text();
        }

        const matches = css.matchAll(/\.bi-([a-z0-9-]+)::?before/g);
        const names = [...new Set([...matches].map(m => m[1]))].sort();
        if (names.length === 0) throw new Error('No Bootstrap Icons names found in CSS');

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ version: BI_VERSION, names }));
        } catch (_) {}

        return names;
    })();

    return iconNamesPromise;
}

let pickerModalEl = null;
let activeInput = null;

function buildPickerModal() {
    if (pickerModalEl) return pickerModalEl;

    pickerModalEl = document.createElement('div');
    pickerModalEl.className = 'modal fade';
    pickerModalEl.id = 'mx-icon-picker-modal';
    pickerModalEl.tabIndex = -1;
    pickerModalEl.setAttribute('aria-hidden', 'true');
    pickerModalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="bi bi-grid-3x3-gap-fill me-2"></i>Scegli un'icona</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
                </div>
                <div class="modal-body">
                    <div class="input-group input-group-sm mb-2">
                        <span class="input-group-text"><i class="bi bi-search"></i></span>
                        <input type="search" id="mx-icon-search" class="form-control" placeholder="Cerca: cart, bank, calendar, fuel..." autocomplete="off">
                        <span class="input-group-text small text-muted" id="mx-icon-count"></span>
                    </div>
                    <div id="mx-icon-grid" class="mx-icon-grid" role="listbox" aria-label="Icone disponibili"></div>
                    <div id="mx-icon-status" class="text-muted small text-center py-2"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(pickerModalEl);

    const search = pickerModalEl.querySelector('#mx-icon-search');
    search.addEventListener('input', () => {
        const grid = pickerModalEl.querySelector('#mx-icon-grid');
        if (grid) applyFilter(grid, search.value);
    });

    pickerModalEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.mx-icon-btn[data-icon-name]');
        if (!btn) return;
        e.preventDefault();
        pickIcon(btn.dataset.iconName);
    });

    return pickerModalEl;
}

function renderIconGrid(grid, names) {
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const name of names) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mx-icon-btn';
        btn.dataset.iconName = name;
        btn.title = name;
        btn.setAttribute('aria-label', name);
        btn.innerHTML = `<i class="bi bi-${name}"></i>`;
        frag.appendChild(btn);
    }
    grid.appendChild(frag);
}

function applyFilter(grid, query) {
    const q = query.trim().toLowerCase();
    let visible = 0;
    for (const btn of grid.children) {
        const name = btn.dataset.iconName || '';
        const match = !q || name.includes(q);
        btn.style.display = match ? '' : 'none';
        if (match) visible++;
    }
    const counter = document.getElementById('mx-icon-count');
    if (counter) counter.textContent = visible.toString();
}

async function openPicker(input) {
    activeInput = input;
    const modalEl = buildPickerModal();
    const Modal = window.bootstrap && window.bootstrap.Modal;
    if (!Modal) {
        console.warn('Bootstrap Modal not available');
        return;
    }
    const modal = Modal.getOrCreateInstance(modalEl);
    const grid = modalEl.querySelector('#mx-icon-grid');
    const status = modalEl.querySelector('#mx-icon-status');
    const search = modalEl.querySelector('#mx-icon-search');

    modal.show();

    if (!grid.dataset.loaded) {
        status.textContent = 'Carico icone...';
        try {
            const names = await loadIconNames();
            renderIconGrid(grid, names);
            grid.dataset.loaded = '1';
            status.textContent = '';
            applyFilter(grid, '');
        } catch (e) {
            status.innerHTML = '<span class="text-danger">Errore nel caricamento icone. Verifica la connessione.</span>';
            console.error(e);
            return;
        }
    }

    const cur = (input.value || '').trim().replace(/^bi-/, '');
    search.value = cur;
    applyFilter(grid, cur);
    setTimeout(() => search.focus(), 100);
}

function pickIcon(name) {
    if (!activeInput) return;
    activeInput.value = `bi-${name}`;
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    if (pickerModalEl && window.bootstrap && window.bootstrap.Modal) {
        window.bootstrap.Modal.getInstance(pickerModalEl)?.hide();
    }
    activeInput = null;
}

function decorateInput(input) {
    if (input.dataset.iconPickerDecorated === '1') return;
    if (!input.parentNode) return;
    input.dataset.iconPickerDecorated = '1';

    const isSm = input.classList.contains('form-control-sm');
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group mx-icon-input-group' + (isSm ? ' input-group-sm' : '');

    input.parentNode.insertBefore(wrapper, input);

    const preview = document.createElement('span');
    preview.className = 'input-group-text mx-icon-preview';
    preview.innerHTML = '<i class="bi bi-question-square text-muted"></i>';
    wrapper.appendChild(preview);

    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-secondary mx-icon-pick-btn';
    btn.title = 'Sfoglia icone';
    btn.setAttribute('aria-label', 'Sfoglia icone Bootstrap');
    btn.innerHTML = '<i class="bi bi-grid-3x3-gap"></i>';
    btn.addEventListener('click', () => openPicker(input));
    wrapper.appendChild(btn);

    const updatePreview = () => {
        const v = (input.value || '').trim();
        const cls = v.startsWith('bi-') ? v : (v ? 'bi-' + v : 'bi-question-square');
        preview.innerHTML = `<i class="bi ${cls}"></i>`;
    };
    input.addEventListener('input', updatePreview);
    input.addEventListener('change', updatePreview);
    updatePreview();
}

function autoBind(root) {
    const scope = root || document;
    const inputs = scope.querySelectorAll('input[data-icon-picker]');
    inputs.forEach(decorateInput);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => autoBind());
} else {
    autoBind();
}

const mo = new MutationObserver((records) => {
    for (const r of records) {
        for (const node of r.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches('input[data-icon-picker]')) {
                decorateInput(node);
            } else if (node.querySelectorAll) {
                node.querySelectorAll('input[data-icon-picker]').forEach(decorateInput);
            }
        }
    }
});
if (document.body) {
    mo.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
}

export { autoBind, openPicker, loadIconNames };
