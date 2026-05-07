// ─── pages/incomes.js ────────────────────────────────────────────────────────
// CRUD entrate: list (con filtri debounced) + inline create + inline row edit + delete.

import FetchRequest                                     from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog, delegateTableClick }            from '../componentBase.js';
import { toast }                                         from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';
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

function accountCell(it) {
    if (!it.account_id) return '<span class="text-muted">—</span>';
    const color = it.account_color || '#6c757d';
    const icon  = it.account_icon ? `<i class="bi bi-${escapeHtml(it.account_icon)} me-1"></i>` : '<i class="bi bi-bank me-1"></i>';
    return `
        <span class="d-inline-block rounded-circle me-1"
              style="width:.7rem;height:.7rem;background-color:${escapeHtml(color)}"></span>
        ${icon}${escapeHtml(it.account_name ?? '')}
    `;
}

const filtersForm = document.getElementById('income-filters');
const createForm  = document.getElementById('income-create-form');
const tbody       = document.getElementById('income-tbody');
const totalEl     = document.getElementById('income-total');
const sourceSel   = filtersForm.querySelector('select[name="source"]');
const sourceList  = document.getElementById('income-sources');
const resetBtn    = document.getElementById('income-filters-reset');

let editingId = null;
let cache     = [];

const PAGE_SIZE = 25;
let pageOffset  = 0;

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function renderRow(it) {
    const detailId = `income-detail-${it.id}`;
    const descRaw = it.description ?? '';
    const descCell = descRaw
        ? `<div class="text-truncate" title="${escapeAttr(descRaw)}">${escapeHtml(descRaw)}</div>`
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
            <td class="text-end text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="edit"  data-id="${it.id}"><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger"    data-action="delete" data-id="${it.id}"><i class="bi bi-trash"></i></button>
            </td>
        </tr>
        ${renderDetailRow(it, detailId)}`;
}

function renderDetailRow(it, detailId) {
    let parts = '';
    if (it.description) {
        parts += `<dt>Descrizione</dt><dd>${escapeHtml(it.description)}</dd>`;
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

function buildAccountOptions(selected) {
    const sel = selected != null ? Number(selected) : null;
    const accSel = document.querySelector('#income-create-form select[name="account_id"]');
    const opts = ['<option value="">— Nessuno —</option>'];
    if (accSel) {
        for (const o of accSel.querySelectorAll('option[value]')) {
            if (o.value === '') continue;
            const s = Number(o.value) === sel ? ' selected' : '';
            opts.push(`<option value="${o.value}"${s}>${escapeHtml(o.textContent.trim())}</option>`);
        }
    }
    return opts.join('');
}

function renderEditRow(it) {
    return `
        <tr data-id="${it.id}" class="table-warning">
            <td></td>
            <td><input type="date" class="form-control form-control-sm" name="income_date" value="${escapeAttr(it.income_date)}" required></td>
            <td><select class="form-select form-select-sm" name="account_id">${buildAccountOptions(it.account_id)}</select></td>
            <td><input type="text" class="form-control form-control-sm" name="source" value="${escapeAttr(it.source)}" maxlength="64" required></td>
            <td><input type="text" class="form-control form-control-sm" name="description" value="${escapeAttr(it.description ?? '')}" maxlength="512"></td>
            <td><input type="text" class="form-control form-control-sm text-end" name="amount" value="${escapeAttr(it.amount)}" inputmode="decimal" required></td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-success" data-action="save"   data-id="${it.id}"><i class="bi bi-check-lg"></i></button>
                <button type="button" class="btn btn-sm btn-secondary" data-action="cancel" data-id="${it.id}"><i class="bi bi-x-lg"></i></button>
            </td>
        </tr>`;
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
            onChange: (newOffset) => { pageOffset = newOffset; loadList(); },
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
        if (editingId !== null && editingId != id) {
            const prev = cache.find(x => x.id == editingId);
            if (prev) {
                const prevTr = tbody.querySelector(`tr[data-id="${editingId}"]`);
                if (prevTr) {
                    // L'edit row precedente non ha detail sibling (rimosso al click edit),
                    // quindi outerHTML può espandere a 2 trs senza orfani.
                    prevTr.outerHTML = renderRow(prev);
                }
            }
        }
        editingId = id;
        const it  = cache.find(x => x.id == id);
        if (!it) return;
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        if (!tr) return;
        // Rimuove il detail row sibling prima di sostituire la view row con l'edit row.
        removeIncomeDetailSibling(tr);
        tr.outerHTML = renderEditRow(it);
    },
    cancel: (id) => {
        const it = cache.find(x => x.id == id);
        if (!it) return;
        editingId = null;
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        if (!tr) return;
        // L'edit row non ha detail sibling: outerHTML inserisce view + detail in posizione.
        tr.outerHTML = renderRow(it);
    },
    save: async (id) => {
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        const data = {
            id,
            source:      tr.querySelector('input[name="source"]').value,
            description: tr.querySelector('input[name="description"]').value,
            amount:      tr.querySelector('input[name="amount"]').value,
            income_date: tr.querySelector('input[name="income_date"]').value,
            account_id:  tr.querySelector('select[name="account_id"]')?.value ?? '',
        };
        try {
            await optimisticUpdate({
                row: tr,
                applyValues: () => { /* values in inputs */ },
                makeFinalRow: () => null,
                call: () => send(`${BASE}/incomes/update`, data),
            });
            toast.success('Entrata aggiornata.');
            editingId = null;
            loadList();
        } catch { /* toast shown */ }
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
