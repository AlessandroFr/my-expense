// ─── pages/incomes.js ────────────────────────────────────────────────────────
// CRUD entrate: list (con filtri debounced) + inline create + inline row edit + delete.

import FetchRequest                                     from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog, delegateTableClick }            from '../componentBase.js';
import { toast }                                         from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete } from '../optimistic.js';
import { renderPager }                                   from '../pager.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const dateFmt = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(String(iso) + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? String(iso) : dateFmt.format(d);
}

// Calcola se il colore di sfondo richiede testo chiaro o scuro (W3C luminance).
function contrastText(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#1B1B2F';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.55 ? '#1B1B2F' : '#FFFFFF';
}

// Estrae il testo "puro" da un valore description che ora puo' contenere HTML
// (output TinyMCE). Usato per la cella compatta della tabella e per i title=.
function htmlToPlain(html) {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = String(html);
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

function accountCell(it) {
    if (!it.account_id) return '<span class="text-muted">—</span>';
    const color = it.account_color || '#6c757d';
    const fg    = contrastText(color);
    const icon  = it.account_icon
        ? `<i class="bi bi-${escapeHtml(it.account_icon)} me-1"></i>`
        : '<i class="bi bi-bank me-1"></i>';
    return `<span class="badge mx-account-badge" style="background-color:${escapeHtml(color)};color:${fg}" title="${escapeAttr(it.account_name ?? '')}">
        ${icon}${escapeHtml(it.account_name ?? '')}
    </span>`;
}

const filtersForm = document.getElementById('income-filters');
const createForm  = document.getElementById('income-create-form');
const tbody       = document.getElementById('income-tbody');
const totalEl     = document.getElementById('income-total');
const sourceSel   = filtersForm.querySelector('select[name="source"]');
const sourceList  = document.getElementById('income-sources');
const resetBtn    = document.getElementById('income-filters-reset');

let cache     = [];

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25];
const PAGE_SIZE_STORAGE_KEY = 'mx-incomes-page-size';
function loadStoredPageSize() {
    try {
        const v = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
        return PAGE_SIZE_OPTIONS.includes(v) ? v : 25;
    } catch { return 25; }
}
let PAGE_SIZE   = loadStoredPageSize();
let pageOffset  = 0;

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function renderRow(it) {
    const detailId = `income-detail-${it.id}`;
    const descPlain = htmlToPlain(it.description ?? '');
    const descCell = descPlain
        ? `<div class="text-truncate" title="${escapeAttr(descPlain)}">${escapeHtml(descPlain)}</div>`
        : `<div class="text-truncate text-muted">—</div>`;
    return `
        <tr data-id="${it.id}">
            <td class="text-center">
                <button type="button" class="btn btn-sm mx-toggle-btn"
                        data-action="toggle"
                        data-id="${it.id}"
                        aria-expanded="false"
                        aria-controls="${detailId}"
                        title="Mostra dettagli">
                    <i class="bi bi-chevron-down"></i>
                </button>
            </td>
            <td class="text-nowrap">${escapeHtml(fmtDate(it.income_date))}</td>
            <td class="text-nowrap">${accountCell(it)}</td>
            <td class="text-nowrap"><span class="badge bg-success-subtle text-success-emphasis">${escapeHtml(it.source)}</span></td>
            <td class="mx-cell-truncate">${descCell}</td>
            <td class="text-end fw-semibold text-success text-nowrap">${fmtMoney(it.amount)}</td>
            <td class="text-end mx-row-actions">
                <div class="dropdown">
                    <button type="button" class="btn btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" title="Azioni">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                        <li><button type="button" class="dropdown-item" data-action="edit" data-id="${it.id}"><i class="bi bi-pencil me-2"></i>Modifica</button></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><button type="button" class="dropdown-item text-danger" data-action="delete" data-id="${it.id}"><i class="bi bi-trash me-2"></i>Elimina</button></li>
                    </ul>
                </div>
            </td>
        </tr>
        ${renderDetailRow(it, detailId)}`;
}

function renderDetailRow(it, detailId) {
    let parts = '';
    if (it.description) {
        // description e' HTML (TinyMCE); rendering diretto.
        parts += `<dt>Descrizione</dt><dd><div class="mx-rich-content">${it.description}</div></dd>`;
    } else {
        parts += `<dt>Descrizione</dt><dd><span class="text-muted">Nessuna descrizione</span></dd>`;
    }
    if (it.value_date && it.value_date !== it.income_date) {
        parts += `<dt>Data valuta</dt><dd>${escapeHtml(fmtDate(it.value_date))}</dd>`;
    }
    if (it.import_hash) {
        parts += `<dt>Origine</dt><dd><i class="bi bi-bank me-1"></i>Importato da estratto conto</dd>`;
    }
    return `
        <tr id="${detailId}" class="mx-detail-row d-none" data-detail-for="${it.id}">
            <td colspan="7"><dl class="mx-detail-panel mb-0">${parts}</dl></td>
        </tr>`;
}

// ── Edit modal ─────────────────────────────────────────────────────────────
let editModalEl = null, editModalInstance = null;

function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

function ensureEditModal() {
    if (editModalInstance) return editModalInstance;
    editModalEl = document.getElementById('income-edit-modal');
    if (!editModalEl) return null;
    editModalInstance = new bootstrap.Modal(editModalEl);
    const form = document.getElementById('income-edit-form');
    form.addEventListener('submit', onEditFormSubmit);
    return editModalInstance;
}

function openEditModal(id) {
    const it = cache.find(x => String(x.id) === String(id));
    if (!it) return;
    const m = ensureEditModal();
    if (!m) return;
    const form = document.getElementById('income-edit-form');
    form.elements['id'].value          = it.id;
    form.elements['income_date'].value = it.income_date ?? '';
    form.elements['amount'].value      = it.amount ?? '';
    form.elements['source'].value      = it.source ?? '';
    form.elements['account_id'].value  = it.account_id != null ? String(it.account_id) : '';
    window.MxRichEditor?.setContent('income-edit-description', it.description ?? '');
    m.show();
}

async function onEditFormSubmit(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
        window.MxRichEditor?.flush();
        const fd = new FormData(form);
        const payload = {
            id:          fd.get('id'),
            income_date: fd.get('income_date'),
            amount:      fd.get('amount'),
            source:      fd.get('source'),
            account_id:  fd.get('account_id') ?? '',
            description: fd.get('description') ?? '',
            _csrf:       getCsrfToken(),
        };
        await send(`${BASE}/incomes/update`, payload);
        toast.success('Entrata aggiornata.');
        editModalInstance?.hide();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore aggiornamento entrata.');
    } finally {
        submitBtn.disabled = false;
    }
}

// Helper: rimuove il detail row che segue immediatamente la view row, se presente.
function removeIncomeDetailSibling(viewTr) {
    const next = viewTr?.nextElementSibling;
    if (next && next.classList.contains('mx-detail-row')) next.remove();
}

function getFilters() {
    const fd = new FormData(filtersForm);
    return Object.fromEntries(Array.from(fd.entries()).filter(([, v]) => v !== ''));
}

function renderTable(items /* serverTotal currently unused for sum since sum is on visible page */) {
    cache = items;
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Nessuna entrata.</td></tr>`;
        totalEl.textContent = fmtMoney(0);
        return;
    }
    tbody.innerHTML = items.map(renderRow).join('');
    totalEl.textContent = fmtMoney(items.reduce((s, x) => s + Number(x.amount), 0));
}

function renderSources(sources) {
    // Preserva la selezione corrente: il dropdown viene riscritto a ogni
    // loadList(), e senza re-applicare `selected` l'utente perde il filtro.
    const cur = sourceSel.value;
    const opts = sources.map(s => {
        const sel = s === cur ? ' selected' : '';
        return `<option value="${escapeAttr(s)}"${sel}>${escapeHtml(s)}</option>`;
    }).join('');
    sourceSel.innerHTML  = '<option value="">Tutte</option>' + opts;
    sourceList.innerHTML = sources.map(s => `<option value="${escapeAttr(s)}"></option>`).join('');
}

async function loadList() {
    try {
        const params = { ...getFilters(), limit: PAGE_SIZE, offset: pageOffset };
        const r = await apiGuard(api.get(`${BASE}/incomes/list`, params));
        const d = r.data ?? {};
        const items = d.incomes ?? [];
        const total = Number(d.total ?? items.length);
        renderTable(items, total);
        renderSources(d.sources ?? []);
        renderPager(document.getElementById('income-pager'), {
            total, limit: PAGE_SIZE, offset: pageOffset,
            label: 'Entrate',
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onChange: (newOffset) => { pageOffset = newOffset; loadList(); },
            onLimitChange: (newLimit) => {
                PAGE_SIZE  = newLimit;
                pageOffset = 0;
                try { localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(newLimit)); } catch {}
                loadList();
            },
        });
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento entrate.');
    }
}

// Cambio filtri → torna a pagina 1
function applyFilters() {
    pageOffset = 0;
    loadList();
}
const debouncedApply = debounce(applyFilters, 300);

filtersForm.addEventListener('input', debouncedApply);
filtersForm.addEventListener('change', applyFilters);
resetBtn.addEventListener('click', () => { filtersForm.reset(); applyFilters(); });

createForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    window.MxRichEditor?.flush();
    const fd = new FormData(createForm);
    const optimisticIt = {
        id: 'pending-' + Date.now(),
        income_date: fd.get('income_date'),
        source:      fd.get('source'),
        description: fd.get('description'),
        amount:      fd.get('amount'),
    };
    const empty = tbody.querySelector('td[colspan]')?.closest('tr');
    if (empty) tbody.innerHTML = '';
    try {
        await optimisticCreate({
            container: tbody,
            makeOptimisticRow: () => {
                const t = document.createElement('tbody');
                t.innerHTML = renderRow(optimisticIt);
                return t.firstElementChild;
            },
            makeFinalRow: () => null,
            call: () => send(`${BASE}/incomes/create`, Object.fromEntries(fd.entries())),
            position: 'prepend',
        });
        toast.success('Entrata aggiunta.');
        createForm.reset();
        window.MxRichEditor?.setContent('income-create-description', '');
        createForm.querySelector('input[name="income_date"]').value = new Date().toISOString().slice(0, 10);
        applyFilters(); // torna a pagina 1 cosi' la nuova entrata e' visibile in cima
    } catch { /* toast already shown */ }
});

delegateTableClick(tbody, {
    toggle: (id) => {
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        if (!tr) return;
        const detail = tr.nextElementSibling;
        if (!detail || !detail.classList.contains('mx-detail-row')) return;
        const willExpand = detail.classList.contains('d-none');
        detail.classList.toggle('d-none', !willExpand);
        const btn = tr.querySelector('[data-action="toggle"]');
        if (btn) {
            btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
            btn.title = willExpand ? 'Nascondi dettagli' : 'Mostra dettagli';
        }
    },
    edit: (id) => {
        openEditModal(id);
    },
    delete: async (id) => {
        const ok = await confirmDialog('Eliminare questa entrata?', { confirmText: 'Elimina', confirmClass: 'btn-danger' });
        if (!ok) return;
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        if (!tr) return;
        // Rimuove subito il detail sibling, poi optimisticDelete sfuma la view row.
        removeIncomeDetailSibling(tr);
        try {
            await optimisticDelete({
                row: tr,
                call: () => send(`${BASE}/incomes/delete`, { id }),
            });
            toast.success('Entrata eliminata.');
            loadList();
        } catch { /* toast already shown */ }
    },
});

document.addEventListener('DOMContentLoaded', loadList);
