// ─── pages/expenses.js ───────────────────────────────────────────────────────
// AJAX layer per /expenses (lista + filtri + create + edit inline + delete).

import FetchRequest         from '../FetchRequest.js';
import { apiSend, apiGuard } from '../componentBase.js';
import { toast }             from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';
import { renderPager }       from '../pager.js';

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

// Paginazione server-side: i filtri resettano page=1; il pager modifica solo offset.
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25];
const PAGE_SIZE_STORAGE_KEY = 'mx-expenses-page-size';
function loadStoredPageSize() {
    try {
        const v = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
        return PAGE_SIZE_OPTIONS.includes(v) ? v : 25;
    } catch { return 25; }
}
let PAGE_SIZE   = loadStoredPageSize();
let pageOffset  = 0;

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}

// Estrae il testo "puro" da un valore description che ora puo' contenere HTML
// (output TinyMCE). Usato per la cella compatta della tabella e per gli
// attributi title=.
function htmlToPlain(html) {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = String(html);
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
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
        account_id: e.account_id,
        account_name: e.account_name,
        account_color: e.account_color || '#6c757d',
        account_icon: e.account_icon,
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

function accountCell(e) {
    if (!e.account_id) return '<span class="text-muted">—</span>';
    const color = e.account_color || '#6c757d';
    const fg    = contrastText(color);
    const icon  = e.account_icon
        ? `<i class="bi bi-${escHtml(e.account_icon)} me-1"></i>`
        : '<i class="bi bi-bank me-1"></i>';
    return `<span class="badge mx-account-badge" style="background-color:${escHtml(color)};color:${fg}" title="${escHtml(e.account_name ?? '')}">
        ${icon}${escHtml(e.account_name ?? '')}
    </span>`;
}

function buildAccountOptions(selected) {
    const sel = selected != null ? Number(selected) : null;
    const accSel = document.querySelector('#expense-create-form select[name="account_id"]');
    const opts = ['<option value="">— Nessuno —</option>'];
    if (accSel) {
        for (const o of accSel.querySelectorAll('option[value]')) {
            if (o.value === '') continue;
            const s = Number(o.value) === sel ? ' selected' : '';
            opts.push(`<option value="${o.value}"${s}>${escHtml(o.textContent.trim())}</option>`);
        }
    }
    return opts.join('');
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

const PAYMENT_ICONS = {
    cash: 'bi-cash',
    card: 'bi-credit-card-2-front',
    transfer: 'bi-bank',
    other: 'bi-three-dots',
};

function paymentIcon(method) {
    return PAYMENT_ICONS[method] ?? 'bi-question-circle';
}

function detailIdFor(e) { return `expense-detail-${e.id}`; }

function renderViewRow(e) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(e.id);
    tr.dataset.expense = JSON.stringify(rowDataFromExpense(e));
    const detailId = detailIdFor(e);
    const descPlain = htmlToPlain(e.description ?? '');
    const descCell = descPlain
        ? `<div class="text-truncate" title="${escHtml(descPlain)}">${escHtml(descPlain)}</div>`
        : `<div class="text-truncate text-muted">—</div>`;
    const tagCount = (e.tags ?? []).length;
    const tagBadge = tagCount > 0
        ? `<span class="badge bg-secondary-subtle text-secondary-emphasis" title="${tagCount} tag"><i class="bi bi-tags me-1"></i>${tagCount}</span>`
        : '';
    const payLabel = PAYMENT_LABELS[e.payment_method] ?? (e.payment_method ?? '');
    tr.innerHTML = `
        <td class="text-center">
            <button type="button" class="btn btn-sm mx-toggle-btn"
                    data-action="toggle"
                    aria-expanded="false"
                    aria-controls="${detailId}"
                    title="Mostra dettagli">
                <i class="bi bi-chevron-down"></i>
            </button>
        </td>
        <td class="text-nowrap">${escHtml(fmtDate(e.expense_date))}</td>
        <td class="text-nowrap">${accountCell(e)}</td>
        <td class="text-nowrap">${categoryCell(e)}</td>
        <td class="mx-cell-truncate">${descCell}</td>
        <td class="text-center">${tagBadge}</td>
        <td class="text-center"><i class="bi ${paymentIcon(e.payment_method)}" title="${escHtml(payLabel)}"></i></td>
        <td class="text-end fw-semibold text-nowrap">${escHtml(fmtMoney(e.amount))}${shareBadge(e)}</td>
        <td class="text-end mx-row-actions">
            <div class="dropdown">
                <button type="button" class="btn btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" title="Azioni">
                    <i class="bi bi-three-dots-vertical"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                    <li><button type="button" class="dropdown-item" data-action="edit"><i class="bi bi-pencil me-2"></i>Modifica</button></li>
                    <li><button type="button" class="dropdown-item" data-action="attach"><i class="bi bi-paperclip me-2"></i>Allegati</button></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><button type="button" class="dropdown-item text-danger" data-action="delete"><i class="bi bi-trash me-2"></i>Elimina</button></li>
                </ul>
            </div>
        </td>`;
    return tr;
}

function renderDetailRow(e) {
    const tr = document.createElement('tr');
    tr.id = detailIdFor(e);
    tr.classList.add('mx-detail-row', 'd-none');
    tr.dataset.detailFor = String(e.id);

    // description e' HTML (TinyMCE); rendering diretto. La whitelist
    // valid_elements di TinyMCE filtra script/handler pericolosi lato editor.
    const desc = e.description
        ? `<div class="mx-rich-content">${e.description}</div>`
        : '<span class="text-muted">Nessuna descrizione</span>';
    const tagsContent = (e.tags && e.tags.length)
        ? tagsCell(e.tags)
        : '<span class="text-muted">—</span>';
    const payLabel = PAYMENT_LABELS[e.payment_method] ?? (e.payment_method ?? '—');

    let parts = `
        <dt>Descrizione</dt><dd>${desc}</dd>
        <dt>Pagamento</dt><dd><i class="bi ${paymentIcon(e.payment_method)} me-1"></i>${escHtml(payLabel)}</dd>
        <dt>Tag</dt><dd>${tagsContent}</dd>
    `;

    if (e.share_amount || e.shared_with) {
        const yours = e.share_amount ? fmtMoney(e.share_amount) : '';
        const total = fmtMoney(e.amount);
        const shared = e.shared_with ? ` · con ${escHtml(e.shared_with)}` : '';
        parts += `<dt>Quota</dt><dd>${yours ? `${yours} di ${total}` : total}${shared}</dd>`;
    }

    if (e.value_date && e.value_date !== e.expense_date) {
        parts += `<dt>Data valuta</dt><dd>${escHtml(fmtDate(e.value_date))}</dd>`;
    }

    if (e.import_hash) {
        parts += `<dt>Origine</dt><dd><i class="bi bi-bank me-1"></i>Importato da estratto conto</dd>`;
    }

    tr.innerHTML = `<td colspan="9"><dl class="mx-detail-panel mb-0">${parts}</dl></td>`;
    return tr;
}

// Sostituisce viewTr (e l'eventuale detail row sibling) con una nuova coppia
// view+detail. Usato dopo update/save per ricaricare la riga senza fare un
// re-render dell'intera tabella.
function replaceRowPair(viewTr, e) {
    const sibling = viewTr.nextElementSibling;
    if (sibling && sibling.classList.contains('mx-detail-row')) sibling.remove();
    const newView = renderViewRow(e);
    const newDetail = renderDetailRow(e);
    viewTr.replaceWith(newView);
    newView.after(newDetail);
}

// Rimuove l'eventuale detail row che segue viewTr (utile prima di edit/delete).
function removeDetailSibling(viewTr) {
    const sibling = viewTr.nextElementSibling;
    if (sibling && sibling.classList.contains('mx-detail-row')) sibling.remove();
}

// Edit modal: popolato dai dataset della <tr> alla pressione di "Modifica".
let editModalEl = null, editModalInstance = null, editModalCurrentId = null;

function ensureEditModal() {
    if (editModalInstance) return editModalInstance;
    editModalEl = document.getElementById('expense-edit-modal');
    if (!editModalEl) return null;
    editModalInstance = new bootstrap.Modal(editModalEl);
    const form = document.getElementById('expense-edit-form');
    form.addEventListener('submit', onEditFormSubmit);
    return editModalInstance;
}

function openEditModal(tr) {
    const m = ensureEditModal();
    if (!m) return;
    const e = JSON.parse(tr.dataset.expense || '{}');
    editModalCurrentId = String(e.id);
    const form = document.getElementById('expense-edit-form');
    form.elements['id'].value             = e.id;
    form.elements['expense_date'].value   = e.expense_date ?? '';
    form.elements['amount'].value         = e.amount ?? '';
    form.elements['payment_method'].value = e.payment_method ?? 'card';
    form.elements['category_id'].value    = e.category_id != null ? String(e.category_id) : '';
    form.elements['account_id'].value     = e.account_id  != null ? String(e.account_id)  : '';
    window.MxRichEditor?.setContent('expense-edit-description', e.description ?? '');
    form.elements['tags'].value           = (e.tags ?? []).map(t => t.name).join(', ');
    form.elements['shared_with'].value    = e.shared_with ?? '';
    form.elements['share_amount'].value   = e.share_amount ?? '';
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
        const id = String(fd.get('id') ?? editModalCurrentId ?? '');
        const tagsCsv = String(fd.get('tags') ?? '');
        const params = new URLSearchParams();
        for (const [k, v] of fd.entries()) {
            if (k === 'tags') continue;
            params.set(k, String(v));
        }
        params.set('_csrf', getCsrfToken());

        const r = await send(`${BASE}/expenses/update`, params);

        if (id) await assignTags(id, tagsCsv);
        await loadTags();
        await loadList();

        toast.success('Spesa aggiornata.');
        showBudgetWarning(r.data?.budget_warning);
        editModalInstance?.hide();
    } catch (err) {
        toast.error(err.message ?? 'Errore aggiornamento spesa.');
    } finally {
        submitBtn.disabled = false;
    }
}

// ── Total ──────────────────────────────────────────────────────────────────

function updateTotalFromTable(serverTotal = null) {
    const rows = document.querySelectorAll('#expenses-tbody tr[data-expense]');
    let pageTotal = 0;
    rows.forEach(r => {
        const e = JSON.parse(r.dataset.expense || '{}');
        pageTotal += Number(e.amount) || 0;
    });
    document.getElementById('expenses-total').textContent = fmtMoney(pageTotal);
    const cnt = serverTotal != null ? serverTotal : rows.length;
    document.getElementById('expenses-count').textContent = `(${cnt} ${cnt === 1 ? 'voce' : 'voci'} totali, pagina di ${rows.length})`;
}

// ── Caricamento lista ───────────────────────────────────────────────────────

async function loadList() {
    const tbody = document.getElementById('expenses-tbody');
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">
        <span class="spinner-border spinner-border-sm me-2"></span>Carico…</td></tr>`;

    try {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(lastFilters)) {
            if (v !== '' && v !== null && v !== undefined) params.set(k, v);
        }
        params.set('limit',  String(PAGE_SIZE));
        params.set('offset', String(pageOffset));

        const r = await apiGuard(api.get(`${BASE}/expenses/list`, params));
        const expenses = r.data?.expenses ?? [];
        const total    = Number(r.data?.total ?? expenses.length);

        tbody.innerHTML = '';
        if (expenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">
                <i class="bi bi-inbox fs-3 d-block mb-1"></i>Nessuna spesa trovata.</td></tr>`;
        } else {
            const frag = document.createDocumentFragment();
            for (const e of expenses) {
                frag.appendChild(renderViewRow(e));
                frag.appendChild(renderDetailRow(e));
            }
            tbody.appendChild(frag);
        }
        updateTotalFromTable(total);
        renderPager(document.getElementById('expenses-pager'), {
            total, limit: PAGE_SIZE, offset: pageOffset,
            label: 'Spese',
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
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">
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
        pageOffset  = 0;   // ogni cambio di filtro torna a pagina 1
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

function setupCashPreselect(form) {
    const paySel = form.elements['payment_method'];
    const accSel = form.elements['account_id'];
    if (!paySel || !accSel) return;
    const defaultCashId = form.dataset.defaultCashId ?? '';
    paySel.addEventListener('change', () => {
        if (paySel.value !== 'cash') return;
        const cur = accSel.options[accSel.selectedIndex];
        const curIsCash = cur && cur.dataset.type === 'cash';
        if (curIsCash) return;
        if (defaultCashId !== '') {
            accSel.value = defaultCashId;
            return;
        }
        const firstCash = [...accSel.options].find(o => o.dataset.type === 'cash');
        if (firstCash) accSel.value = firstCash.value;
    });
}

function wireCreateForm() {
    const form = document.getElementById('expense-create-form');
    if (!form) return;

    setupCashPreselect(form);

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            window.MxRichEditor?.flush();
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
            // optimisticCreate inserisce solo la view row; aggancio il detail row
            // come sibling, partendo chiuso (d-none).
            if (exp) {
                const newRow = tbody.querySelector(`tr[data-id="${exp.id}"]`);
                if (newRow && !(newRow.nextElementSibling?.classList.contains('mx-detail-row'))) {
                    newRow.after(renderDetailRow(exp));
                }
            }
            const tagsCsv = form.querySelector('input[name="tags"]')?.value ?? '';
            if (tagsCsv.trim() !== '' && exp) {
                const tags = await assignTags(exp.id, tagsCsv);
                if (tags) {
                    const newRow = tbody.querySelector(`tr[data-id="${exp.id}"]`);
                    if (newRow) replaceRowPair(newRow, { ...exp, tags });
                }
                await loadTags();
            }
            updateTotalFromTable();

            form.reset();
            window.MxRichEditor?.setContent('expense-create-description', '');
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

        if (action === 'toggle') {
            const detail = tr.nextElementSibling;
            if (!detail || !detail.classList.contains('mx-detail-row')) return;
            const willExpand = detail.classList.contains('d-none');
            detail.classList.toggle('d-none', !willExpand);
            btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
            btn.title = willExpand ? 'Nascondi dettagli' : 'Mostra dettagli';
            return;
        }

        if (action === 'edit') {
            openEditModal(tr);
            return;
        }

        if (action === 'attach') {
            openAttachmentsModal(tr.dataset.id);
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
                removeDetailSibling(tr);
                tr.remove();
                updateTotalFromTable();
                const tbody2 = document.getElementById('expenses-tbody');
                if (!tbody2.children.length) {
                    tbody2.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">
                        <i class="bi bi-inbox fs-3 d-block mb-1"></i>Nessuna spesa.</td></tr>`;
                }
                toast.success('Spesa eliminata.');
            } catch (err) {
                btn.disabled = false;
                toast.error(err.message ?? 'Errore eliminazione spesa.');
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

// ── Bank statement import (preview + commit wizard) ───────────────────────

const BANK_KINDS = [
    { value: 'expense',       label: 'Spesa' },
    { value: 'income',        label: 'Entrata' },
    { value: 'transfer_pair', label: 'Trasferimento (pair)' },
    { value: 'atm_pair',      label: 'Prelievo ATM (pair)' },
];

const BANK_KIND_BADGE = {
    expense:       'bg-danger-subtle text-danger',
    income:        'bg-success-subtle text-success',
    transfer_pair: 'bg-info-subtle text-info',
    atm_pair:      'bg-warning-subtle text-warning',
};
const BANK_KIND_LABEL = {
    expense:       'Spesa',
    income:        'Entrata',
    transfer_pair: 'Trasferimento',
    atm_pair:      'Prelievo ATM',
};
const BANK_PAIR_KINDS = new Set(['transfer_pair', 'atm_pair']);

const BANK_PAGE_SIZE = 15;

let bankPreviewState = {
    accountId: 0,
    accountName: '',
    pair: 1,
    rows: [],
    categories: [],
    page: 1,
};

function bankRenderCategoryOptions(selectedId) {
    const opts = [`<option value="">— nessuna —</option>`];
    for (const c of bankPreviewState.categories) {
        const sel = (selectedId !== null && Number(selectedId) === Number(c.id)) ? ' selected' : '';
        opts.push(`<option value="${c.id}"${sel}>${escHtml(c.name)}</option>`);
    }
    return opts.join('');
}

function bankRenderPaymentOptions(selected) {
    return PAYMENT_OPTIONS.map(p => {
        const sel = p === selected ? ' selected' : '';
        return `<option value="${p}"${sel}>${escHtml(PAYMENT_LABELS[p])}</option>`;
    }).join('');
}

function bankRenderKindOptions(selected) {
    return BANK_KINDS.map(k => {
        const sel = k.value === selected ? ' selected' : '';
        return `<option value="${k.value}"${sel}>${escHtml(k.label)}</option>`;
    }).join('');
}

function bankRenderRow(r) {
    const isPair   = BANK_PAIR_KINDS.has(r.kind);
    const isIncome = r.kind === 'income';

    const dupBadge = r.is_duplicate
        ? `<span class="badge bg-warning text-dark" title="Gia' presente in DB">duplicato</span>`
        : '';
    const kindBadge = `<span class="badge ${BANK_KIND_BADGE[r.kind] ?? 'bg-secondary'}">${escHtml(BANK_KIND_LABEL[r.kind] ?? r.kind)}</span>`;

    // Importo grande, segnato e colorato in base al kind
    const amountSign = isIncome ? '+' : '−';
    const amountClass = isIncome ? 'text-success' : (isPair ? 'text-info' : 'text-danger');
    const amountFmt = Number(r.amount ?? 0).toLocaleString('it-IT', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

    // Categoria / Origine (terzo campo della grid editabile)
    let middleField;
    if (isIncome) {
        middleField = `
            <input type="text" class="form-control form-control-sm bank-cell" data-field="source"
                   value="${escHtml(r.source ?? '')}" placeholder="Es. Bonifico da X" maxlength="64">`;
    } else {
        middleField = `
            <select class="form-select form-select-sm bank-cell" data-field="category_id">
                ${bankRenderCategoryOptions(r.category_id)}
            </select>`;
    }

    const payDefault = r.payment_method ?? (isIncome ? 'transfer' : 'card');

    // Anagrafica: solo per spese/entrate (skipped per partite doppie interne)
    let contactBlock = '';
    if (!isPair) {
        const contactBadge = r.contact_id_matched
            ? `<span class="badge bg-info-subtle text-info ms-1" title="Anagrafica esistente">esistente</span>`
            : (r.contact_suggested_name ? `<span class="badge bg-warning-subtle text-warning ms-1" title="Verra' creata">nuova</span>` : '');
        const backfillBadge = (Number(r.contact_backfill_count) > 0)
            ? `<span class="badge bg-success-subtle text-success ms-1" title="Al commit verranno collegati ${r.contact_backfill_count} movimenti gia' presenti che menzionano questo nome">+${r.contact_backfill_count} backfill</span>`
            : '';
        contactBlock = `
            <div class="col-12 col-md-4 col-lg-3">
                <label class="form-label small mb-1">${isIncome ? 'Cliente' : 'Fornitore'}${contactBadge}${backfillBadge}</label>
                <input type="text" class="form-control form-control-sm bank-cell" data-field="contact_name"
                       value="${escHtml(r.contact_name ?? '')}" placeholder="—" maxlength="120" list="contacts-datalist">
            </div>`;
    }

    // Distribuzione colonne grid: con anagrafica visibile o nascosta
    const cols = isPair
        ? { kind: 3, mid: 4, pay: 3, amt: 2 }
        : { kind: 2, mid: 3, pay: 2, amt: 2 };

    return `<div data-idx="${r.idx}" class="card ${r.skip ? 'opacity-50 bg-body-tertiary' : 'shadow-sm'} bank-row-card">
        <div class="card-body py-2 px-3">
            <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <input type="checkbox" class="form-check-input bank-cell mt-0" data-field="include" ${r.skip ? '' : 'checked'} title="Importa questa riga">
                ${kindBadge}
                ${dupBadge}
                <span class="text-muted small text-nowrap">
                    <i class="bi bi-calendar3 me-1"></i>${escHtml(fmtDate(r.op_date ?? ''))}
                    ${r.value_date ? `<span class="ms-2"><i class="bi bi-calendar-check"></i> val. ${escHtml(fmtDate(r.value_date))}</span>` : ''}
                </span>
                <div class="ms-auto fw-semibold ${amountClass}" style="font-size:1.15rem;">
                    ${amountSign} € ${amountFmt}
                </div>
            </div>

            <div class="mb-2">
                <input type="text" class="form-control form-control-sm bank-cell" data-field="description"
                       value="${escHtml(r.description ?? '')}" maxlength="512" placeholder="Descrizione">
                ${r.tipologia ? `<div class="form-text small mt-0 fst-italic text-truncate" title="${escHtml(r.tipologia)}">${escHtml(r.tipologia)}</div>` : ''}
            </div>

            <div class="row g-2 align-items-end">
                <div class="col-6 col-md-${cols.kind}">
                    <label class="form-label small mb-1">Tipo</label>
                    <select class="form-select form-select-sm bank-cell" data-field="kind">
                        ${bankRenderKindOptions(r.kind)}
                    </select>
                </div>
                <div class="col-6 col-md-${cols.mid}">
                    <label class="form-label small mb-1">${isIncome ? 'Origine' : 'Categoria'}</label>
                    ${middleField}
                </div>
                ${contactBlock}
                <div class="col-6 col-md-${cols.pay}">
                    <label class="form-label small mb-1">Pagamento</label>
                    <select class="form-select form-select-sm bank-cell" data-field="payment_method">
                        ${bankRenderPaymentOptions(payDefault)}
                    </select>
                </div>
                <div class="col-6 col-md-${cols.amt}">
                    <label class="form-label small mb-1">Importo €</label>
                    <input type="number" step="0.01" min="0.01" class="form-control form-control-sm text-end bank-cell"
                           data-field="amount" value="${Number(r.amount ?? 0).toFixed(2)}">
                </div>
            </div>

            <details class="small mt-2">
                <summary class="text-muted">Modifica date</summary>
                <div class="row g-2 mt-1">
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Data operazione</label>
                        <input type="date" class="form-control form-control-sm bank-cell" data-field="op_date" value="${escHtml(r.op_date ?? '')}">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Data valuta</label>
                        <input type="date" class="form-control form-control-sm bank-cell" data-field="value_date" value="${escHtml(r.value_date ?? '')}">
                    </div>
                </div>
            </details>
        </div>
    </div>`;
}

function bankPageCount() {
    return Math.max(1, Math.ceil((bankPreviewState.rows?.length ?? 0) / BANK_PAGE_SIZE));
}

function bankClampPage() {
    const total = bankPageCount();
    if (bankPreviewState.page < 1) bankPreviewState.page = 1;
    if (bankPreviewState.page > total) bankPreviewState.page = total;
}

function bankPagedRows() {
    bankClampPage();
    const start = (bankPreviewState.page - 1) * BANK_PAGE_SIZE;
    return bankPreviewState.rows.slice(start, start + BANK_PAGE_SIZE);
}

function bankRenderPager() {
    const list = document.getElementById('bank-preview-pager-list');
    const info = document.getElementById('bank-preview-pager-info');
    if (!list || !info) return;
    const total = bankPageCount();
    const cur   = bankPreviewState.page;
    const totRows = bankPreviewState.rows.length;
    const start   = totRows === 0 ? 0 : (cur - 1) * BANK_PAGE_SIZE + 1;
    const end     = Math.min(totRows, cur * BANK_PAGE_SIZE);
    info.textContent = totRows === 0
        ? 'Nessuna riga'
        : `Righe ${start}–${end} di ${totRows} (pagina ${cur} di ${total})`;

    const items = [];
    items.push(`<li class="page-item ${cur === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${cur - 1}" aria-label="Precedente">&laquo;</a></li>`);

    // Compatto: mostra max 7 numeri di pagina centrati su quella corrente.
    const window = 3;
    const from = Math.max(1, cur - window);
    const to   = Math.min(total, cur + window);
    if (from > 1) items.push(`<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`);
    if (from > 2) items.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    for (let p = from; p <= to; p++) {
        items.push(`<li class="page-item ${p === cur ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${p}">${p}</a></li>`);
    }
    if (to < total - 1) items.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    if (to < total) items.push(`<li class="page-item"><a class="page-link" href="#" data-page="${total}">${total}</a></li>`);

    items.push(`<li class="page-item ${cur === total ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${cur + 1}" aria-label="Successiva">&raquo;</a></li>`);
    list.innerHTML = items.join('');
}

function bankRenderRows() {
    const tbody = document.getElementById('bank-preview-list');
    if (!tbody) return;
    bankClampPage();
    tbody.innerHTML = bankPagedRows().map(bankRenderRow).join('');
    bankRenderPager();
}

function bankRenderSummary(d) {
    const summary = document.getElementById('bank-preview-summary');
    if (!summary) return;
    const counts = bankPreviewState.rows.reduce((acc, r) => {
        acc[r.kind] = (acc[r.kind] ?? 0) + 1;
        if (r.is_duplicate) acc.dup++;
        return acc;
    }, { expense: 0, income: 0, transfer_pair: 0, dup: 0 });

    const ibanLine = d.account_iban_detected
        ? ` &middot; IBAN file <code>${escHtml(d.account_iban_detected)}</code>`
        : '';
    summary.innerHTML = `
        <div class="alert alert-info small mb-0 py-2">
            <strong>${bankPreviewState.rows.length}</strong> righe parsate su conto
            <strong>${escHtml(bankPreviewState.accountName)}</strong>${ibanLine}.
            Spese ${counts.expense}, entrate ${counts.income}, ricariche pair ${counts.transfer_pair},
            duplicate ${counts.dup}.
        </div>`;

    const errs = d.parse_errors ?? [];
    const errBox = document.getElementById('bank-parse-errors');
    if (errs.length) {
        errBox.innerHTML = `<div class="small text-muted">Righe non parsabili (${errs.length}):</div>
            <ul class="small mb-0">${errs.slice(0, 20).map(e => `<li>Riga CSV ${e.row}: ${escHtml(e.message)}</li>`).join('')}</ul>`;
    } else {
        errBox.innerHTML = '';
    }
}

function bankShowStep(n) {
    document.getElementById('bank-import-step1').classList.toggle('d-none', n !== 1);
    document.getElementById('bank-step1-footer').classList.toggle('d-none', n !== 1);
    document.getElementById('bank-import-step2').classList.toggle('d-none', n !== 2);
}

// Sincronizza il record in bankPreviewState.rows[idx] dai valori dell'input
// modificato. Necessario perche' con la paginazione il DOM contiene solo la
// pagina corrente: lo state e' la fonte di verita' al momento del commit.
function bankSyncRowFromTr(tr) {
    const idx = Number(tr.dataset.idx);
    const get = (f) => tr.querySelector(`[data-field="${f}"]`);
    const r = bankPreviewState.rows.find(x => x.idx === idx);
    if (!r) return null;

    const includeEl = get('include');
    if (includeEl) r.skip = !includeEl.checked;

    const kindEl = get('kind');
    if (kindEl) r.kind = kindEl.value;

    const opEl = get('op_date');     if (opEl)  r.op_date     = opEl.value || r.op_date;
    const vdEl = get('value_date');  if (vdEl)  r.value_date  = vdEl.value || null;
    const descEl = get('description'); if (descEl) r.description = descEl.value;
    const amtEl = get('amount');     if (amtEl) r.amount      = Number(amtEl.value || 0);

    if (r.kind === 'income') {
        const srcEl = get('source');
        if (srcEl) r.source = srcEl.value;
    } else {
        const catEl = get('category_id');
        if (catEl) r.category_id = catEl.value !== '' ? Number(catEl.value) : null;
    }
    const payEl = get('payment_method');
    if (payEl) r.payment_method = payEl.value;

    // Anagrafica editata: se l'utente ha cambiato il testo, scarta il match
    // precedente (saranno creati al volo via Contact::findOrCreate).
    const contactEl = get('contact_name');
    if (contactEl) {
        const newName = contactEl.value.trim();
        if (newName !== (r.contact_name ?? '').trim()) {
            r.contact_id = null;
            r.contact_id_matched = null;
        }
        r.contact_name = newName;
    }

    return r;
}

function wireBankImport() {
    const form = document.getElementById('bank-import-form');
    if (!form) return;

    const modal      = document.getElementById('bank-import-modal');
    const resultBox  = document.getElementById('bank-import-result');
    const tbody      = document.getElementById('bank-preview-list');
    const toggleAll  = document.getElementById('bank-toggle-all');
    const backBtn    = document.getElementById('bank-back-btn');
    const commitBtn  = document.getElementById('bank-commit-btn');
    const newCatBtn  = document.getElementById('bank-new-category-btn');
    const newCatName = document.getElementById('bank-new-category-name');
    const newCatCol  = document.getElementById('bank-new-category-color');
    const step1Status = document.getElementById('bank-step1-status');

    const setStep1Status = (msg, level = 'muted') => {
        if (!step1Status) return;
        if (!msg) { step1Status.innerHTML = ''; return; }
        const cls = ({
            error: 'text-danger',
            warn:  'text-warning',
            info:  'text-primary',
            muted: 'text-muted',
        })[level] ?? 'text-muted';
        step1Status.innerHTML = `<span class="${cls}"></span>`;
        step1Status.querySelector('span').textContent = msg;
    };

    const runPreview = async (ev) => {
        if (ev) ev.preventDefault();
        const submitBtn = form.querySelector('#bank-preview-btn, button[type="submit"]');
        const fileInput = form.querySelector('input[name="file"]');
        const accSelect = form.querySelector('select[name="account_id"]');
        if (accSelect && !accSelect.value) {
            setStep1Status('Seleziona un conto.', 'warn');
            toast.warning('Seleziona un conto.');
            return;
        }
        if (fileInput && (!fileInput.files || fileInput.files.length === 0)) {
            setStep1Status('Seleziona il file CSV dell\'estratto conto.', 'warn');
            toast.warning('Seleziona il file CSV dell\'estratto conto.');
            return;
        }
        if (submitBtn) submitBtn.disabled = true;
        setStep1Status('Analisi anteprima in corso...', 'info');
        try {
            const fd = new FormData(form);
            bankPreviewState.accountId   = Number(fd.get('account_id') ?? 0);
            bankPreviewState.accountName = form.querySelector('select[name="account_id"] option:checked')?.textContent ?? '';
            bankPreviewState.pair        = fd.get('auto_pair_ricariche') ? 1 : 0;

            const r = await fetch(`${BASE}/import/bank-statement/preview`, {
                method: 'POST',
                body: fd,
                headers: { 'X-CSRF-Token': getCsrfToken() },
            });
            const json = await r.json();
            if (!json.ok) throw new Error(json.error?.message ?? 'Errore anteprima.');
            const d = json.data ?? {};
            bankPreviewState.rows       = (d.rows ?? []).map(r => ({
                ...r,
                // Normalizza i suggerimenti anagrafica in campi che il commit
                // backend consuma direttamente (resolveContactFromRow).
                contact_id:   r.contact_id   ?? r.contact_id_matched ?? null,
                contact_name: r.contact_name ?? r.contact_suggested_name ?? '',
            }));
            bankPreviewState.categories = d.categories ?? [];
            bankPreviewState.page       = 1;
            if (toggleAll) toggleAll.checked = bankPreviewState.rows.some(r => !r.skip);

            if (resultBox) resultBox.innerHTML = '';
            setStep1Status('');
            bankRenderRows();
            bankRenderSummary(d);
            bankShowStep(2);
        } catch (err) {
            setStep1Status('Errore: ' + (err.message ?? 'anteprima fallita.'), 'error');
            toast.error(err.message ?? 'Errore anteprima.');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    };

    // Belt-and-suspenders: ascolta sia il submit event sia il click sul bottone.
    // Se per qualche ragione il submit listener non si aggancia in tempo
    // (deferred module + DOMContentLoaded race), il click sul bottone scatta lo stesso.
    form.addEventListener('submit', runPreview);
    form.querySelector('#bank-preview-btn')?.addEventListener('click', runPreview);

    // Toggle all: opera su TUTTE le righe in stato (non solo quelle visibili).
    toggleAll?.addEventListener('change', () => {
        const checked = toggleAll.checked;
        for (const r of bankPreviewState.rows) r.skip = !checked;
        bankRenderRows();
    });

    // Ogni cambio cella sincronizza prima lo state, poi (se kind cambia)
    // ridisegna la riga perche' colonna source/category cambia.
    tbody?.addEventListener('change', (ev) => {
        const cell = ev.target.closest('.bank-cell');
        if (!cell) return;
        const tr = cell.closest('[data-idx]');
        if (!tr) return;
        const field = cell.dataset.field;

        const r = bankSyncRowFromTr(tr);
        if (!r) return;

        if (field === 'include') {
            tr.classList.toggle('opacity-50', r.skip);
            tr.classList.toggle('bg-body-tertiary', r.skip);
            tr.classList.toggle('shadow-sm', !r.skip);
            return;
        }
        if (field === 'kind') {
            // Pair kinds (transfer/atm) non hanno anagrafica → la pulisco
            // perche' altrimenti il commit la propagherebbe per errore.
            if (BANK_PAIR_KINDS.has(r.kind)) {
                r.contact_id = null;
                r.contact_id_matched = null;
                r.contact_name = '';
            }
            // Re-render solo la riga interessata mantenendo posizione in pagina.
            tr.outerHTML = bankRenderRow(r);
        }
    });

    // Pager: click su numeri di pagina o prev/next.
    document.getElementById('bank-preview-pager-list')?.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-page]');
        if (!a) return;
        ev.preventDefault();
        const p = Number(a.dataset.page);
        if (!Number.isFinite(p)) return;
        bankPreviewState.page = p;
        bankRenderRows();
    });

    backBtn?.addEventListener('click', () => bankShowStep(1));

    modal?.addEventListener('hidden.bs.modal', () => {
        bankShowStep(1);
        if (resultBox) resultBox.innerHTML = '';
        setStep1Status('');
        bankPreviewState.rows = [];
        bankPreviewState.page = 1;
    });

    newCatBtn?.addEventListener('click', async () => {
        const name = (newCatName?.value ?? '').trim();
        if (name === '') { toast.warning('Inserisci un nome categoria.'); return; }
        const color = (newCatCol?.value ?? '#6c757d');
        newCatBtn.disabled = true;
        try {
            const r = await send(`${BASE}/categories/create`, { name, color, icon: '', sort_order: 0 });
            const cat = r?.data?.category ?? null;
            const newId = Number(cat?.id ?? 0);
            if (newId > 0) {
                bankPreviewState.categories.push({
                    id:    newId,
                    name:  cat.name ?? name,
                    color: cat.color ?? color,
                });
                tbody.querySelectorAll('select[data-field="category_id"]').forEach(sel => {
                    const cur = sel.value;
                    sel.innerHTML = bankRenderCategoryOptions(cur === '' ? null : Number(cur));
                });
                toast.success(`Categoria "${name}" creata.`);
                newCatName.value = '';
            }
        } catch (err) {
            toast.error(err.message ?? 'Errore creazione categoria.');
        } finally {
            newCatBtn.disabled = false;
        }
    });

    commitBtn?.addEventListener('click', async () => {
        if (!tbody) return;
        // Sincronizza prima lo state con i valori delle righe ATTUALMENTE in DOM
        // (la pagina visibile potrebbe avere edit non ancora propagati).
        tbody.querySelectorAll('[data-idx]').forEach(bankSyncRowFromTr);
        const rows = bankPreviewState.rows;
        const toImport = rows.filter(r => !r.skip).length;
        if (toImport === 0) { toast.warning('Nessuna riga selezionata.'); return; }

        commitBtn.disabled = true;
        if (resultBox) {
            resultBox.innerHTML = `<div class="text-muted small">
                <span class="spinner-border spinner-border-sm me-2"></span>Conferma import in corso...</div>`;
        }
        try {
            const fd = new FormData();
            fd.append('account_id', String(bankPreviewState.accountId));
            fd.append('rows', JSON.stringify(rows));
            const r = await fetch(`${BASE}/import/bank-statement/commit`, {
                method: 'POST',
                body: fd,
                headers: { 'X-CSRF-Token': getCsrfToken() },
            });
            const json = await r.json();
            if (!json.ok) throw new Error(json.error?.message ?? 'Errore conferma import.');
            const d = json.data ?? {};
            const errs = (d.errors ?? []).slice(0, 10);
            let html = `<div class="alert alert-success small mb-2">
                <strong>${d.imported_expenses}</strong> spese, <strong>${d.imported_incomes}</strong> entrate importate.<br>
                <strong>${d.transfers_paired}</strong> ricariche con partita doppia.
                Saltate <strong>${d.skipped_duplicate}</strong> duplicate, <strong>${d.skipped_user}</strong> deselezionate dall'utente.
            </div>`;
            if (errs.length) {
                html += `<div class="small text-muted">Errori (${(d.errors ?? []).length}):</div>
                    <ul class="small mb-0">` +
                    errs.map(e => `<li>Riga ${e.idx}: ${escHtml(e.message)}</li>`).join('') +
                    `</ul>`;
            }
            if (resultBox) resultBox.innerHTML = html;
            const tot = (d.imported_expenses ?? 0) + (d.imported_incomes ?? 0) + (d.transfers_paired ?? 0);
            toast.success(`Estratto conto importato: ${tot} righe.`);
            loadList();
        } catch (err) {
            if (resultBox) {
                resultBox.innerHTML = `<div class="alert alert-danger small mb-0">${escHtml(err.message ?? 'Errore.')}</div>`;
            }
            toast.error(err.message ?? 'Errore conferma import.');
        } finally {
            commitBtn.disabled = false;
        }
    });
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
    wireBankImport();
    wireOcr();
    loadTags();
    loadSavedFilters();
    loadList();
});
