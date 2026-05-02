// ─── pages/incomes.js ────────────────────────────────────────────────────────
// CRUD entrate: list (con filtri debounced) + inline create + inline row edit + delete.

import FetchRequest                                     from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog, delegateTableClick }            from '../componentBase.js';
import { toast }                                         from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const filtersForm = document.getElementById('income-filters');
const createForm  = document.getElementById('income-create-form');
const tbody       = document.getElementById('income-tbody');
const totalEl     = document.getElementById('income-total');
const sourceSel   = filtersForm.querySelector('select[name="source"]');
const sourceList  = document.getElementById('income-sources');
const resetBtn    = document.getElementById('income-filters-reset');

let editingId = null;
let cache     = [];

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function renderRow(it) {
    const desc = it.description ? escapeHtml(it.description) : '<span class="text-muted">-</span>';
    return `
        <tr data-id="${it.id}">
            <td>${escapeHtml(it.income_date)}</td>
            <td><span class="badge bg-success-subtle text-success-emphasis">${escapeHtml(it.source)}</span></td>
            <td>${desc}</td>
            <td class="text-end fw-semibold text-success">${fmtMoney(it.amount)}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="edit"  data-id="${it.id}"><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger"    data-action="delete" data-id="${it.id}"><i class="bi bi-trash"></i></button>
            </td>
        </tr>`;
}

function renderEditRow(it) {
    return `
        <tr data-id="${it.id}" class="table-warning">
            <td><input type="date" class="form-control form-control-sm" name="income_date" value="${escapeAttr(it.income_date)}" required></td>
            <td><input type="text" class="form-control form-control-sm" name="source" value="${escapeAttr(it.source)}" maxlength="64" required></td>
            <td><input type="text" class="form-control form-control-sm" name="description" value="${escapeAttr(it.description ?? '')}" maxlength="255"></td>
            <td><input type="text" class="form-control form-control-sm text-end" name="amount" value="${escapeAttr(it.amount)}" inputmode="decimal" required></td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-success" data-action="save"   data-id="${it.id}"><i class="bi bi-check-lg"></i></button>
                <button type="button" class="btn btn-sm btn-secondary" data-action="cancel" data-id="${it.id}"><i class="bi bi-x-lg"></i></button>
            </td>
        </tr>`;
}

function getFilters() {
    const fd = new FormData(filtersForm);
    return Object.fromEntries(Array.from(fd.entries()).filter(([, v]) => v !== ''));
}

function renderTable(items) {
    cache = items;
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Nessuna entrata.</td></tr>`;
        totalEl.textContent = fmtMoney(0);
        return;
    }
    tbody.innerHTML = items.map(renderRow).join('');
    totalEl.textContent = fmtMoney(items.reduce((s, x) => s + Number(x.amount), 0));
}

function renderSources(sources) {
    const opts = sources.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
    sourceSel.innerHTML  = '<option value="">Tutte</option>' + opts;
    sourceList.innerHTML = opts;
}

async function loadList() {
    try {
        const r = await apiGuard(api.get(`${BASE}/incomes/list`, getFilters()));
        const d = r.data ?? {};
        renderTable(d.incomes ?? []);
        renderSources(d.sources ?? []);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento entrate.');
    }
}

const debouncedReload = debounce(loadList, 300);

filtersForm.addEventListener('input', debouncedReload);
filtersForm.addEventListener('change', loadList);
resetBtn.addEventListener('click', () => { filtersForm.reset(); loadList(); });

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
        loadList();
    } catch { /* toast already shown */ }
});

delegateTableClick(tbody, {
    edit: (id) => {
        if (editingId !== null) {
            const prev = cache.find(x => x.id == editingId);
            if (prev) tbody.querySelector(`tr[data-id="${editingId}"]`).outerHTML = renderRow(prev);
        }
        editingId = id;
        const it  = cache.find(x => x.id == id);
        if (!it) return;
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        tr.outerHTML = renderEditRow(it);
    },
    cancel: (id) => {
        const it = cache.find(x => x.id == id);
        if (!it) return;
        editingId = null;
        tbody.querySelector(`tr[data-id="${id}"]`).outerHTML = renderRow(it);
    },
    save: async (id) => {
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        const data = {
            id,
            source:      tr.querySelector('input[name="source"]').value,
            description: tr.querySelector('input[name="description"]').value,
            amount:      tr.querySelector('input[name="amount"]').value,
            income_date: tr.querySelector('input[name="income_date"]').value,
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
