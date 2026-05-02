// ─── pages/expenses.js ───────────────────────────────────────────────────────
// AJAX layer per /expenses (lista + filtri + create + edit inline + delete).

import FetchRequest         from '../FetchRequest.js';
import { apiSend, apiGuard } from '../componentBase.js';
import { toast }             from '../toast.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);

const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });

const PAYMENT_LABELS = {
    cash: 'Contanti', card: 'Carta', transfer: 'Bonifico', other: 'Altro',
};
const PAYMENT_OPTIONS = ['cash', 'card', 'transfer', 'other'];

// State
let categories  = [];
let allTags     = [];   // tutti i tag dell'utente {id, name, color}
let lastFilters = {};

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}

function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

function fmtMoney(n) { return moneyFmt.format(Number(n) || 0); }

function showBudgetWarning(w) {
    if (!w) return;
    if (w.exceeded) {
        toast.error(`Budget "${w.name}" superato! Speso ${fmtMoney(w.spent)} su ${fmtMoney(w.amount)} (${w.progress_pct}%).`);
    } else if (w.near_limit) {
        toast.warning(`Attenzione: budget "${w.name}" all'${w.progress_pct}% (${fmtMoney(w.spent)} / ${fmtMoney(w.amount)}).`);
    }
}
function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : dateFmt.format(d);
}

function rowDataFromExpense(e) {
    return {
        id: e.id,
        category_id: e.category_id,
        category_name: e.category_name,
        category_color: e.category_color || '#6c757d',
        category_icon: e.category_icon,
        amount: e.amount,
        description: e.description,
        payment_method: e.payment_method,
        expense_date: e.expense_date,
        tags: e.tags ?? [],
    };
}

function tagsCell(tags) {
    if (!tags || !tags.length) return '<span class="text-muted">—</span>';
    return tags.map(t =>
        `<span class="badge me-1" style="background:${escHtml(t.color)}">${escHtml(t.name)}</span>`
    ).join('');
}

function categoryCell(e) {
    if (!e.category_id) return '<span class="text-muted">—</span>';
    return `
        <span class="d-inline-block rounded-circle me-1"
              style="width:.7rem;height:.7rem;background-color:${escHtml(e.category_color)}"></span>
        ${e.category_icon ? `<i class="bi ${escHtml(e.category_icon)} me-1"></i>` : ''}
        ${escHtml(e.category_name)}
    `;
}

function buildCategoryOptions(selected) {
    const sel = selected != null ? Number(selected) : null;
    let opts = '<option value="">— Nessuna —</option>';
    for (const c of categories) {
        const s = Number(c.id) === sel ? ' selected' : '';
        opts += `<option value="${c.id}"${s}>${escHtml(c.name)}</option>`;
    }
    return opts;
}

function buildPaymentOptions(selected) {
    return PAYMENT_OPTIONS.map(p =>
        `<option value="${p}"${p === selected ? ' selected' : ''}>${escHtml(PAYMENT_LABELS[p])}</option>`
    ).join('');
}

// ── Render rows ────────────────────────────────────────────────────────────

function renderViewRow(e) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(e.id);
    tr.dataset.expense = JSON.stringify(rowDataFromExpense(e));
    tr.innerHTML = `
        <td>${escHtml(fmtDate(e.expense_date))}</td>
        <td>${categoryCell(e)}</td>
        <td>${escHtml(e.description ?? '')}</td>
        <td>${tagsCell(e.tags)}</td>
        <td><span class="badge bg-light text-dark">${escHtml(PAYMENT_LABELS[e.payment_method] ?? e.payment_method)}</span></td>
        <td class="text-end fw-semibold">${escHtml(fmtMoney(e.amount))}</td>
        <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="edit"><i class="bi bi-pencil"></i></button>
            <button type="button" class="btn btn-sm btn-outline-danger"    data-action="delete"><i class="bi bi-trash"></i></button>
        </td>`;
    return tr;
}

function replaceWithEditRow(tr) {
    const e = JSON.parse(tr.dataset.expense || '{}');
    const tagNames = (e.tags ?? []).map(t => t.name).join(', ');
    const edit = document.createElement('tr');
    edit.dataset.id = String(e.id);
    edit.classList.add('table-warning');
    edit.innerHTML = `
        <td><input type="date"   name="expense_date"   class="form-control form-control-sm" required value="${escHtml(e.expense_date)}"></td>
        <td><select               name="category_id"    class="form-select form-select-sm">${buildCategoryOptions(e.category_id)}</select></td>
        <td><input type="text"   name="description"    class="form-control form-control-sm" maxlength="255" value="${escHtml(e.description ?? '')}"></td>
        <td><input type="text"   name="tags"           class="form-control form-control-sm" list="all-tags-datalist" placeholder="tag, separati, da, virgola" value="${escHtml(tagNames)}"></td>
        <td><select               name="payment_method" class="form-select form-select-sm">${buildPaymentOptions(e.payment_method)}</select></td>
        <td><input type="number" name="amount"         class="form-control form-control-sm text-end" step="0.01" min="0.01" required value="${escHtml(e.amount)}"></td>
        <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-success" data-action="save"><i class="bi bi-check-lg"></i></button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="cancel"><i class="bi bi-x-lg"></i></button>
        </td>`;
    tr.replaceWith(edit);
}

// ── Total ──────────────────────────────────────────────────────────────────

function updateTotalFromTable() {
    const rows = document.querySelectorAll('#expenses-tbody tr[data-expense]');
    let total = 0;
    rows.forEach(r => {
        const e = JSON.parse(r.dataset.expense || '{}');
        total += Number(e.amount) || 0;
    });
    document.getElementById('expenses-total').textContent = fmtMoney(total);
    document.getElementById('expenses-count').textContent = `(${rows.length} ${rows.length === 1 ? 'voce' : 'voci'})`;
}

// ── Caricamento lista ───────────────────────────────────────────────────────

async function loadList() {
    const tbody = document.getElementById('expenses-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
        <span class="spinner-border spinner-border-sm me-2"></span>Carico…</td></tr>`;

    try {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(lastFilters)) {
            if (v !== '' && v !== null && v !== undefined) params.set(k, v);
        }
        const r = await apiGuard(api.get(`${BASE}/expenses/list`, params));
        const expenses = r.data?.expenses ?? [];

        tbody.innerHTML = '';
        if (expenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
                <i class="bi bi-inbox fs-3 d-block mb-1"></i>Nessuna spesa trovata.</td></tr>`;
        } else {
            const frag = document.createDocumentFragment();
            for (const e of expenses) frag.appendChild(renderViewRow(e));
            tbody.appendChild(frag);
        }
        updateTotalFromTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">
            <i class="bi bi-x-circle me-2"></i>${escHtml(err.message ?? 'Errore caricamento')}</td></tr>`;
    }
}

// ── Categorie (dalla pagina, scraping select del form create) ──────────────

function loadCategoriesFromDom() {
    const sel = document.querySelector('#expense-create-form select[name="category_id"]');
    if (!sel) return;
    categories = [...sel.querySelectorAll('option[value]')]
        .filter(o => o.value !== '')
        .map(o => ({ id: Number(o.value), name: o.textContent.trim() }));
}

async function loadTags() {
    try {
        const r = await apiGuard(api.get(`${BASE}/tags/list`));
        allTags = r.data?.tags ?? [];
        renderTagDataList();
        renderTagFilter();
    } catch (err) {
        // Silent: la lista tag non è critica.
    }
}

function renderTagDataList() {
    const dl = document.getElementById('all-tags-datalist');
    if (!dl) return;
    dl.innerHTML = allTags.map(t => `<option value="${escHtml(t.name)}"></option>`).join('');
}

function renderTagFilter() {
    const sel = document.getElementById('filter-tag');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tutti</option>' +
        allTags.map(t => `<option value="${escHtml(t.name)}"${t.name === cur ? ' selected' : ''}>${escHtml(t.name)}</option>`).join('');
}

async function assignTags(expenseId, tagsCsv) {
    if (tagsCsv === undefined || tagsCsv === null) return null;
    const params = new URLSearchParams();
    params.set('expense_id', expenseId);
    params.set('names',      tagsCsv);
    params.set('_csrf',      getCsrfToken());
    try {
        const r = await send(`${BASE}/tags/assign`, params);
        return r.data?.tags ?? [];
    } catch (err) {
        toast.error(err.message ?? 'Errore assegnazione tag.');
        return null;
    }
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function wireFilters() {
    const form = document.getElementById('expenses-filters');
    if (!form) return;

    let timer = null;
    const apply = () => {
        const fd = new FormData(form);
        lastFilters = Object.fromEntries(fd.entries());
        loadList();
    };
    const debounced = () => { clearTimeout(timer); timer = setTimeout(apply, 300); };

    form.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t.type === 'date' || t.tagName === 'SELECT') apply();
        else debounced();
    });

    document.getElementById('filters-reset')?.addEventListener('click', () => {
        form.reset();
        apply();
    });
}

function wireCreateForm() {
    const form = document.getElementById('expense-create-form');
    if (!form) return;

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            const params = new URLSearchParams(new FormData(form));
            params.set('_csrf', getCsrfToken());
            const r = await send(`${BASE}/expenses/create`, params);
            const exp = r.data?.expense;
            if (!exp) throw new Error('Risposta server inattesa.');

            const tagsCsv = form.querySelector('input[name="tags"]')?.value ?? '';
            if (tagsCsv.trim() !== '') {
                const tags = await assignTags(exp.id, tagsCsv);
                if (tags) exp.tags = tags;
                await loadTags();
            }

            const tbody = document.getElementById('expenses-tbody');
            const empty = tbody.querySelector('td[colspan]')?.closest('tr');
            if (empty) tbody.innerHTML = '';
            tbody.prepend(renderViewRow(exp));
            updateTotalFromTable();

            form.reset();
            const dateEl = form.querySelector('input[name="expense_date"]');
            if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

            toast.success('Spesa registrata.');
            showBudgetWarning(r.data?.budget_warning);
        } catch (err) {
            toast.error(err.message ?? 'Errore creazione spesa.');
        } finally {
            submitBtn.disabled = false;
        }
    });
}

function wireTableActions() {
    const tbody = document.getElementById('expenses-tbody');
    if (!tbody) return;

    tbody.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        const tr = btn.closest('tr');
        if (!tr) return;
        const action = btn.dataset.action;

        if (action === 'edit') {
            replaceWithEditRow(tr);
            return;
        }

        if (action === 'cancel') {
            await loadList();
            return;
        }

        if (action === 'delete') {
            const id   = tr.dataset.id;
            const data = tr.dataset.expense ? JSON.parse(tr.dataset.expense) : {};
            const desc = data.description || `spesa #${id}`;
            if (!confirm(`Eliminare "${desc}"?`)) return;
            btn.disabled = true;
            try {
                const params = new URLSearchParams();
                params.set('id', id);
                params.set('_csrf', getCsrfToken());
                await send(`${BASE}/expenses/delete`, params);
                tr.remove();
                updateTotalFromTable();
                const tbody2 = document.getElementById('expenses-tbody');
                if (!tbody2.children.length) {
                    tbody2.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
                        <i class="bi bi-inbox fs-3 d-block mb-1"></i>Nessuna spesa.</td></tr>`;
                }
                toast.success('Spesa eliminata.');
            } catch (err) {
                btn.disabled = false;
                toast.error(err.message ?? 'Errore eliminazione spesa.');
            }
            return;
        }

        if (action === 'save') {
            const id = tr.dataset.id;
            const inputs = tr.querySelectorAll('input, select');
            const params = new URLSearchParams();
            params.set('id', id);
            params.set('_csrf', getCsrfToken());
            const tagsCsv = tr.querySelector('input[name="tags"]')?.value ?? '';
            inputs.forEach(i => {
                if (i.name === 'tags') return; // gestito separatamente
                params.set(i.name, i.value);
            });

            btn.disabled = true;
            try {
                const r = await send(`${BASE}/expenses/update`, params);
                const exp = r.data?.expense;
                if (!exp) throw new Error('Risposta server inattesa.');
                const tags = await assignTags(id, tagsCsv);
                if (tags) exp.tags = tags;
                await loadTags();
                tr.replaceWith(renderViewRow(exp));
                updateTotalFromTable();
                toast.success('Spesa aggiornata.');
                showBudgetWarning(r.data?.budget_warning);
            } catch (err) {
                btn.disabled = false;
                toast.error(err.message ?? 'Errore aggiornamento spesa.');
            }
            return;
        }
    });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

function wireCsvButtons() {
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(lastFilters)) {
                if (v !== '' && v !== null && v !== undefined) params.set(k, v);
            }
            const qs  = params.toString();
            const url = `${BASE}/expenses/export${qs ? '?' + qs : ''}`;
            window.location.href = url;
        });
    }

    const importForm = document.getElementById('csv-import-form');
    const resultBox  = document.getElementById('csv-import-result');
    if (importForm) {
        importForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const submitBtn = importForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            resultBox.innerHTML = `<div class="text-muted small">
                <span class="spinner-border spinner-border-sm me-2"></span>Importazione in corso...</div>`;
            try {
                const fd = new FormData(importForm);
                const r  = await fetch(`${BASE}/expenses/import`, {
                    method: 'POST',
                    body:   fd,
                    headers: { 'X-CSRF-Token': getCsrfToken() },
                });
                const json = await r.json();
                if (!json.ok) {
                    throw new Error(json.error?.message ?? 'Errore import.');
                }
                const d = json.data ?? {};
                const errs = (d.errors ?? []).slice(0, 10);
                let html = `<div class="alert alert-success small mb-2">
                    Importate <strong>${d.imported}</strong> spese, saltate <strong>${d.skipped}</strong>.
                </div>`;
                if (errs.length) {
                    html += `<div class="small text-muted">Prime ${errs.length} righe scartate:</div>
                        <ul class="small mb-0">` +
                        errs.map(e => `<li>Riga ${e.row}: ${escHtml(e.message)}</li>`).join('') +
                        `</ul>`;
                }
                resultBox.innerHTML = html;
                toast.success(`Importate ${d.imported} spese.`);
                loadList();
            } catch (err) {
                resultBox.innerHTML = `<div class="alert alert-danger small mb-0">
                    ${escHtml(err.message ?? 'Errore import.')}</div>`;
                toast.error(err.message ?? 'Errore import.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCategoriesFromDom();
    wireFilters();
    wireCreateForm();
    wireTableActions();
    wireCsvButtons();
    loadTags();
    loadList();
});
