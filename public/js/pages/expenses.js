// ─── pages/expenses.js ───────────────────────────────────────────────────────
// AJAX layer per /expenses (lista + filtri + create + edit inline + delete).

import FetchRequest         from '../FetchRequest.js';
import { apiSend, apiGuard } from '../componentBase.js';
import { toast }             from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';

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
        shared_with: e.shared_with,
        share_amount: e.share_amount,
        payment_method: e.payment_method,
        expense_date: e.expense_date,
        tags: e.tags ?? [],
    };
}

function shareBadge(e) {
    if (!e.shared_with && !e.share_amount) return '';
    const yours = e.share_amount ? fmtMoney(e.share_amount) : '';
    const tip   = e.shared_with ? `Diviso con: ${e.shared_with}` : 'Spesa condivisa';
    return `<span class="badge bg-info-subtle text-info-emphasis ms-1" title="${escHtml(tip)}">
        <i class="bi bi-people me-1"></i>${yours || 'split'}</span>`;
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
        <td class="text-end fw-semibold">${escHtml(fmtMoney(e.amount))}${shareBadge(e)}</td>
        <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="attach" title="Allegati"><i class="bi bi-paperclip"></i></button>
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
        <td>
            <input type="text" name="description" class="form-control form-control-sm mb-1" maxlength="255" value="${escHtml(e.description ?? '')}">
            <input type="text" name="shared_with" class="form-control form-control-sm" maxlength="255" placeholder="Condiviso con..." value="${escHtml(e.shared_with ?? '')}">
        </td>
        <td><input type="text"   name="tags"           class="form-control form-control-sm" list="all-tags-datalist" placeholder="tag, separati" value="${escHtml(tagNames)}"></td>
        <td><select               name="payment_method" class="form-select form-select-sm">${buildPaymentOptions(e.payment_method)}</select></td>
        <td>
            <input type="number" name="amount"       class="form-control form-control-sm text-end mb-1" step="0.01" min="0.01" required value="${escHtml(e.amount)}" title="Totale">
            <input type="number" name="share_amount" class="form-control form-control-sm text-end" step="0.01" min="0.01" placeholder="tua quota" value="${escHtml(e.share_amount ?? '')}" title="La tua quota">
        </td>
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

            const tbody = document.getElementById('expenses-tbody');
            const empty = tbody.querySelector('td[colspan]')?.closest('tr');
            if (empty) tbody.innerHTML = '';

            const fd = new FormData(form);
            const optimisticExpense = {
                id: 'pending-' + Date.now(),
                expense_date: fd.get('expense_date'),
                category_id: fd.get('category_id'),
                category_name: '',
                category_color: '#6c757d',
                description: fd.get('description'),
                payment_method: fd.get('payment_method'),
                amount: fd.get('amount'),
                tags: [],
            };

            const r = await optimisticCreate({
                container: tbody,
                makeOptimisticRow: () => renderViewRow(optimisticExpense),
                makeFinalRow: (resp) => renderViewRow(resp.data?.expense ?? optimisticExpense),
                call: () => send(`${BASE}/expenses/create`, params),
                position: 'prepend',
            });

            const exp = r.data?.expense;
            const tagsCsv = form.querySelector('input[name="tags"]')?.value ?? '';
            if (tagsCsv.trim() !== '' && exp) {
                const tags = await assignTags(exp.id, tagsCsv);
                if (tags) {
                    const newRow = tbody.querySelector(`tr[data-id="${exp.id}"]`);
                    if (newRow) {
                        const updated = { ...exp, tags };
                        newRow.replaceWith(renderViewRow(updated));
                    }
                }
                await loadTags();
            }
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
            await withViewTransition(() => replaceWithEditRow(tr));
            return;
        }

        if (action === 'attach') {
            openAttachmentsModal(tr.dataset.id);
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
                if (i.name === 'tags') return;
                params.set(i.name, i.value);
            });

            btn.disabled = true;
            try {
                const r = await optimisticUpdate({
                    row: tr,
                    applyValues: () => { /* values already shown in inputs */ },
                    makeFinalRow: (resp) => {
                        const exp = resp.data?.expense;
                        return exp ? renderViewRow(exp) : null;
                    },
                    call: () => send(`${BASE}/expenses/update`, params),
                });
                const exp = r.data?.expense;
                const tags = await assignTags(id, tagsCsv);
                if (tags && exp) {
                    const newRow = document.querySelector(`#expenses-tbody tr[data-id="${exp.id}"]`);
                    if (newRow) newRow.replaceWith(renderViewRow({ ...exp, tags }));
                }
                await loadTags();
                updateTotalFromTable();
                toast.success('Spesa aggiornata.');
                showBudgetWarning(r.data?.budget_warning);
            } catch {
                btn.disabled = false;
            }
            return;
        }
    });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}

let attachmentsModalEl = null;
let attachmentsModal   = null;
let currentAttachExpenseId = null;

function ensureAttachmentsModal() {
    if (attachmentsModal) return attachmentsModal;
    attachmentsModalEl = document.getElementById('attachments-modal');
    attachmentsModal   = new bootstrap.Modal(attachmentsModalEl);
    const form = document.getElementById('attachment-upload-form');
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        try {
            const r = await fetch(`${BASE}/attachments/upload`, {
                method: 'POST',
                body: fd,
                headers: { 'X-CSRF-Token': getCsrfToken() },
            });
            const json = await r.json();
            if (!json.ok) throw new Error(json.error?.message ?? 'Upload fallito.');
            toast.success('Allegato caricato.');
            form.querySelector('input[name="file"]').value = '';
            loadAttachmentsList(currentAttachExpenseId);
        } catch (err) {
            toast.error(err.message ?? 'Upload fallito.');
        }
    });
    document.getElementById('attachments-list').addEventListener('click', async (ev) => {
        const del = ev.target.closest('[data-att-action="delete"]');
        if (!del) return;
        if (!confirm('Eliminare l\'allegato?')) return;
        const params = new URLSearchParams();
        params.set('id',     del.dataset.id);
        params.set('_csrf',  getCsrfToken());
        try {
            await send(`${BASE}/attachments/delete`, params);
            toast.success('Allegato eliminato.');
            loadAttachmentsList(currentAttachExpenseId);
        } catch (err) {
            toast.error(err.message ?? 'Errore eliminazione.');
        }
    });
    return attachmentsModal;
}

async function loadAttachmentsList(expenseId) {
    const box = document.getElementById('attachments-list');
    box.innerHTML = '<div class="text-muted small text-center py-2">Caricamento…</div>';
    try {
        const r = await apiGuard(api.get(`${BASE}/attachments/list`, { expense_id: expenseId }));
        const items = r.data?.attachments ?? [];
        if (!items.length) {
            box.innerHTML = '<div class="text-muted small text-center py-2">Nessun allegato.</div>';
            return;
        }
        box.innerHTML = items.map(a => {
            const isImg = (a.mime_type || '').startsWith('image/');
            const icon  = isImg ? 'bi-image' : 'bi-file-earmark-pdf';
            return `
            <div class="d-flex align-items-center mb-2 border rounded p-2">
                <i class="bi ${icon} fs-4 me-2 text-muted"></i>
                <div class="flex-grow-1">
                    <div class="fw-semibold small">${escHtml(a.original_name)}</div>
                    <div class="text-muted small">${escHtml(a.mime_type)} · ${fmtBytes(a.size_bytes)}</div>
                </div>
                <a href="${BASE}/attachments/download?id=${a.id}" target="_blank" class="btn btn-sm btn-outline-primary me-1" title="Apri">
                    <i class="bi bi-eye"></i>
                </a>
                <a href="${BASE}/attachments/download?id=${a.id}&download=1" class="btn btn-sm btn-outline-secondary me-1" title="Scarica">
                    <i class="bi bi-download"></i>
                </a>
                <button type="button" class="btn btn-sm btn-outline-danger" data-att-action="delete" data-id="${a.id}" title="Elimina">
                    <i class="bi bi-trash"></i>
                </button>
            </div>`;
        }).join('');
    } catch (err) {
        box.innerHTML = `<div class="alert alert-danger small mb-0">${escHtml(err.message ?? 'Errore.')}</div>`;
    }
}

function openAttachmentsModal(expenseId) {
    ensureAttachmentsModal();
    currentAttachExpenseId = expenseId;
    document.querySelector('#attachment-upload-form input[name="expense_id"]').value = expenseId;
    loadAttachmentsList(expenseId);
    attachmentsModal.show();
}

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

// ── Saved filters ──────────────────────────────────────────────────────────

let savedFiltersCache = [];

async function loadSavedFilters() {
    try {
        const r = await apiGuard(api.get(`${BASE}/filters/list`, { scope: 'expenses' }));
        savedFiltersCache = r.data?.filters ?? [];
        renderSavedFiltersMenu();
    } catch (err) {
        // silenzioso
    }
}

function renderSavedFiltersMenu() {
    const menu = document.getElementById('saved-filters-menu');
    if (!menu) return;
    const items = savedFiltersCache;
    const head = `<li><a class="dropdown-item small" href="#" data-saved-action="save"><i class="bi bi-floppy me-1"></i>Salva filtro corrente...</a></li>
                  <li><hr class="dropdown-divider"></li>`;
    const body = items.length === 0
        ? `<li><span class="dropdown-item-text small text-muted">Nessun filtro salvato.</span></li>`
        : items.map(f => `
            <li class="d-flex">
                <a class="dropdown-item small flex-grow-1" href="#" data-saved-action="apply" data-id="${f.id}">
                    <i class="bi bi-funnel me-1"></i>${escHtml(f.name)}
                </a>
                <a class="dropdown-item small text-danger flex-shrink-0" href="#" data-saved-action="delete" data-id="${f.id}" style="width:auto" title="Elimina">
                    <i class="bi bi-trash"></i>
                </a>
            </li>`).join('');
    menu.innerHTML = head + body;
}

function applyFiltersToForm(payload) {
    const form = document.getElementById('expenses-filters');
    form.reset();
    for (const [k, v] of Object.entries(payload ?? {})) {
        const el = form.querySelector(`[name="${k}"]`);
        if (el) el.value = v;
    }
    lastFilters = { ...payload };
    loadList();
}

document.addEventListener('click', async (ev) => {
    const a = ev.target.closest('[data-saved-action]');
    if (!a) return;
    ev.preventDefault();
    const action = a.dataset.savedAction;

    if (action === 'save') {
        const name = prompt('Nome del filtro?');
        if (!name) return;
        const params = new URLSearchParams();
        params.set('name',    name);
        params.set('scope',   'expenses');
        params.set('payload', JSON.stringify(lastFilters));
        params.set('_csrf',   getCsrfToken());
        try {
            await send(`${BASE}/filters/save`, params);
            toast.success('Filtro salvato.');
            loadSavedFilters();
        } catch (err) {
            toast.error(err.message ?? 'Errore salvataggio filtro.');
        }
    } else if (action === 'apply') {
        const f = savedFiltersCache.find(x => x.id == a.dataset.id);
        if (f) applyFiltersToForm(f.payload);
    } else if (action === 'delete') {
        if (!confirm('Eliminare questo filtro salvato?')) return;
        try {
            await send(`${BASE}/filters/delete`, { id: a.dataset.id });
            toast.success('Filtro eliminato.');
            loadSavedFilters();
        } catch (err) {
            toast.error(err.message ?? 'Errore eliminazione filtro.');
        }
    }
});

function wireOcr() {
    const input  = document.getElementById('ocr-input');
    const status = document.getElementById('ocr-status');
    if (!input) return;

    input.addEventListener('change', async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        status.textContent = 'Caricamento OCR...';
        try {
            const { extractFromImage } = await import(`${BASE}/js/ocr.js`);
            const result = await extractFromImage(file, (m) => {
                if (m.status && m.progress != null) {
                    status.textContent = `${m.status} ${(m.progress * 100).toFixed(0)}%`;
                }
            });
            const form = document.getElementById('expense-create-form');
            let parts = [];
            if (result.amount) {
                form.querySelector('input[name="amount"]').value = result.amount.toFixed(2);
                parts.push(`importo ${result.amount.toFixed(2)}`);
            }
            if (result.date) {
                form.querySelector('input[name="expense_date"]').value = result.date;
                parts.push(`data ${result.date}`);
            }
            if (parts.length) {
                status.textContent = 'Estratti: ' + parts.join(', ') + '. Verifica i campi prima di salvare.';
                toast.success('OCR completato.');
            } else {
                status.textContent = 'Nessun importo o data riconosciuti. Compila a mano.';
                toast.warning('OCR: nulla di riconoscibile.');
            }
        } catch (err) {
            status.textContent = '';
            toast.error(err.message ?? 'Errore OCR.');
        } finally {
            input.value = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadCategoriesFromDom();
    wireFilters();
    wireCreateForm();
    wireTableActions();
    wireCsvButtons();
    wireOcr();
    loadTags();
    loadSavedFilters();
    loadList();
});
