// ─── pages/contacts.js ────────────────────────────────────────────────────────
// Gestione anagrafiche fornitori/clienti: lista paginata server-side,
// ricerca debounced, modal CRUD, archivio/elimina.

import FetchRequest from '../FetchRequest.js';
import { apiSend }   from '../componentBase.js';
import { toast }     from '../toast.js';
import { optimisticDelete } from '../optimistic.js';
import { renderPager } from '../pager.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);

const BASE = document.body.dataset.baseUrl ?? '';

const PAGE_SIZE_OPTIONS  = [10, 25, 50, 100];
const PAGE_SIZE_DEFAULT  = 25;
const PAGE_SIZE_KEY      = 'mx-contacts-page-size';

function loadStoredPageSize() {
    const raw = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZE_OPTIONS.includes(raw) ? raw : PAGE_SIZE_DEFAULT;
}
function storePageSize(n) {
    if (PAGE_SIZE_OPTIONS.includes(n)) localStorage.setItem(PAGE_SIZE_KEY, String(n));
}

let PAGE_SIZE  = loadStoredPageSize();
let pageOffset = 0;
let cache = { contactsById: new Map(), balances: new Map() };

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}
function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}
function fmtAmount(v) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);
}
function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

// ── Render tabella ──────────────────────────────────────────────────────────

function renderRow(c) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(c.id);
    if (c.archived) tr.classList.add('text-muted', 'fst-italic');

    const bal = cache.balances.get(c.id);
    const exp = bal ? Number(bal.expenses_total) : 0;
    const inc = bal ? Number(bal.incomes_total)  : 0;
    const net = bal ? Number(bal.net) : 0;
    const netClass = net > 0 ? 'text-success' : (net < 0 ? 'text-danger' : 'text-muted');

    const detailUrl = `${BASE}/contacts/detail?id=${c.id}`;
    tr.innerHTML = `
        <td>
            <span class="d-inline-block rounded-circle"
                  style="width:1.2rem;height:1.2rem;background-color:${escHtml(c.color)}"></span>
        </td>
        <td>
            <a href="${detailUrl}" class="text-decoration-none">${escHtml(c.name)}</a>
            ${c.archived ? '<span class="badge bg-warning-subtle text-warning ms-1">archiviato</span>' : ''}
        </td>
        <td class="text-end">${exp ? fmtAmount(exp) : '<span class="text-muted">—</span>'}</td>
        <td class="text-end">${inc ? fmtAmount(inc) : '<span class="text-muted">—</span>'}</td>
        <td class="text-end ${netClass}">${bal ? fmtAmount(net) : '<span class="text-muted">—</span>'}</td>
        <td><code class="small">${escHtml(c.vat_number || '')}</code></td>
        <td class="text-end text-nowrap">
            <a href="${detailUrl}" class="btn btn-sm btn-outline-secondary" title="Dettaglio">
                <i class="bi bi-graph-up"></i>
            </a>
            <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" title="Modifica">
                <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" title="Elimina">
                <i class="bi bi-trash"></i>
            </button>
        </td>`;
    return tr;
}

function renderRows(items, total) {
    const tbody = document.getElementById('contacts-tbody');
    const empty = document.getElementById('contacts-empty');
    if (!tbody) return;
    tbody.innerHTML = '';
    cache.contactsById.clear();
    if (!items || items.length === 0) {
        empty?.classList.remove('d-none');
    } else {
        empty?.classList.add('d-none');
        for (const c of items) {
            cache.contactsById.set(c.id, c);
            tbody.appendChild(renderRow(c));
        }
    }
    const countEl = document.getElementById('contacts-count');
    if (countEl) {
        countEl.textContent = `${total} totali`;
    }
}

function renderPagerSection(total) {
    const node = document.getElementById('contacts-pager');
    if (!node) return;
    renderPager(node, {
        total, limit: PAGE_SIZE, offset: pageOffset,
        label: 'anagrafiche',
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        onChange: (newOffset) => {
            pageOffset = newOffset;
            loadList();
        },
        onLimitChange: (newLimit) => {
            PAGE_SIZE = newLimit;
            storePageSize(newLimit);
            pageOffset = 0;
            loadList();
        },
    });
}

// ── Caricamento dati ────────────────────────────────────────────────────────

function currentFilters() {
    return {
        search: (document.getElementById('filter-search')?.value ?? '').trim(),
        include_archived: document.getElementById('filter-archived')?.checked ? 1 : 0,
    };
}

async function loadList() {
    const { search, include_archived } = currentFilters();
    const page = Math.floor(pageOffset / PAGE_SIZE) + 1;
    const params = new URLSearchParams({
        page:             String(page),
        page_size:        String(PAGE_SIZE),
        include_archived: String(include_archived),
        with_usage:       '1',
    });
    if (search !== '') params.set('search', search);

    try {
        const [listResp, balanceResp] = await Promise.all([
            api.get(`${BASE}/contacts/list?${params.toString()}`),
            api.get(`${BASE}/contacts/balance?year=${new Date().getFullYear()}`),
        ]);
        const data = listResp?.data ?? {};
        const items = data.contacts ?? [];
        const total = Number(data.total ?? items.length);

        cache.balances = new Map();
        for (const b of (balanceResp?.data?.summary ?? [])) {
            cache.balances.set(b.contact_id, b);
        }

        renderRows(items, total);
        renderPagerSection(total);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento anagrafiche.');
    }
}

const reloadDebounced = debounce(() => {
    pageOffset = 0;
    loadList();
}, 300);

// ── Modal ────────────────────────────────────────────────────────────────────

function openModal(contact = null) {
    const dlg = document.getElementById('contact-modal');
    const form = document.getElementById('contact-form');
    if (!dlg || !form) return;
    form.reset();
    form.querySelector('input[name="id"]').value = '';
    form.querySelector('input[name="archived"]').value = '0';

    const archiveBtn   = form.querySelector('[data-action="archive"]');
    const archiveLabel = form.querySelector('[data-archive-label]');
    const modeLabel    = form.querySelector('[data-mode-label]');

    if (contact) {
        modeLabel.textContent = 'Modifica anagrafica';
        form.querySelector('input[name="id"]').value          = contact.id;
        form.querySelector('input[name="name"]').value        = contact.name ?? '';
        form.querySelector('input[name="vat_number"]').value  = contact.vat_number ?? '';
        form.querySelector('input[name="iban"]').value        = contact.iban ?? '';
        form.querySelector('input[name="email"]').value       = contact.email ?? '';
        form.querySelector('input[name="notes"]').value       = contact.notes ?? '';
        form.querySelector('input[name="color"]').value       = contact.color || '#6c757d';
        form.querySelector('input[name="archived"]').value    = contact.archived ? '1' : '0';
        archiveBtn.classList.remove('d-none');
        archiveLabel.textContent = contact.archived ? 'Ripristina' : 'Archivia';
        archiveBtn.dataset.archived = contact.archived ? '1' : '0';
        archiveBtn.dataset.id = contact.id;
    } else {
        modeLabel.textContent = 'Nuova anagrafica';
        form.querySelector('input[name="color"]').value = '#6c757d';
        archiveBtn.classList.add('d-none');
    }
    dlg.showModal();
}

function closeModal() {
    document.getElementById('contact-modal')?.close();
}

async function submitForm(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const id = form.querySelector('input[name="id"]').value;
    const params = new URLSearchParams(new FormData(form));
    params.set('_csrf', getCsrfToken());
    const url = id ? `${BASE}/contacts/update` : `${BASE}/contacts/create`;
    try {
        await send(url, params);
        toast.success(id ? 'Anagrafica aggiornata.' : 'Anagrafica creata.');
        closeModal();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore salvataggio.');
    }
}

async function archiveCurrent() {
    const form = document.getElementById('contact-form');
    const id = form.querySelector('input[name="id"]').value;
    if (!id) return;
    const archived = form.querySelector('[data-action="archive"]').dataset.archived === '1' ? 0 : 1;
    const params = new URLSearchParams({ id, archived: String(archived), _csrf: getCsrfToken() });
    try {
        await send(`${BASE}/contacts/archive`, params);
        toast.success(archived ? 'Anagrafica archiviata.' : 'Anagrafica ripristinata.');
        closeModal();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore archiviazione.');
    }
}

// ── Wire events ──────────────────────────────────────────────────────────────

function wire() {
    document.querySelector('[data-action="new"]')?.addEventListener('click', () => openModal(null));

    const dlg = document.getElementById('contact-modal');
    dlg?.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-action="close"]')) closeModal();
        if (ev.target.closest('[data-action="archive"]')) archiveCurrent();
    });

    document.getElementById('contact-form')?.addEventListener('submit', submitForm);

    const tbody = document.getElementById('contacts-tbody');
    tbody?.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        if (!tr) return;
        const id = Number(tr.dataset.id);
        const editBtn = ev.target.closest('[data-action="edit"]');
        const delBtn  = ev.target.closest('[data-action="delete"]');
        if (editBtn) {
            const contact = cache.contactsById.get(id);
            if (contact) openModal(contact);
            return;
        }
        if (delBtn) {
            const contact = cache.contactsById.get(id);
            if (!contact) return;
            const usage = contact.usage?.total ?? 0;
            const msg = usage > 0
                ? `"${contact.name}" e' collegata a ${usage} movimenti. Eliminandola le spese/entrate restano ma perdono il riferimento. Procedere?`
                : `Eliminare "${contact.name}"?`;
            if (!confirm(msg)) return;
            try {
                await optimisticDelete({
                    row: tr,
                    call: () => {
                        const params = new URLSearchParams({ id: String(id), _csrf: getCsrfToken() });
                        return send(`${BASE}/contacts/delete`, params);
                    },
                });
                cache.contactsById.delete(id);
                cache.balances.delete(id);
                toast.success('Anagrafica eliminata.');
                loadList();
            } catch { /* toast handled */ }
        }
    });

    document.getElementById('filter-search')?.addEventListener('input', reloadDebounced);
    document.getElementById('filter-archived')?.addEventListener('change', () => {
        pageOffset = 0;
        loadList();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    wire();
    loadList();
});
