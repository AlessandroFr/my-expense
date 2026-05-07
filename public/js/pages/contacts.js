// ─── pages/contacts.js ────────────────────────────────────────────────────────
// Gestione anagrafiche fornitori/clienti: lista filtrabile, modal CRUD,
// archivio/elimina, badge saldo netto periodo corrente.

import FetchRequest from '../FetchRequest.js';
import { apiSend }   from '../componentBase.js';
import { toast }     from '../toast.js';
import { optimisticDelete } from '../optimistic.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);

const BASE = document.body.dataset.baseUrl ?? '';

const TYPE_LABEL = {
    supplier: 'Fornitore',
    customer: 'Cliente',
    both:     'Entrambi',
};
const TYPE_BADGE = {
    supplier: 'bg-danger-subtle text-danger',
    customer: 'bg-success-subtle text-success',
    both:     'bg-secondary-subtle text-secondary',
};

let cache = { contacts: [], balances: new Map() };

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

// ── Render tabella ──────────────────────────────────────────────────────────

function applyFilters(items) {
    const t = document.getElementById('filter-type')?.value ?? '';
    const q = (document.getElementById('filter-search')?.value ?? '').trim().toLowerCase();
    return items.filter(c => {
        if (t === 'supplier' && !['supplier', 'both'].includes(c.type)) return false;
        if (t === 'customer' && !['customer', 'both'].includes(c.type)) return false;
        if (t === 'both' && c.type !== 'both') return false;
        if (q !== '') {
            const haystack = [c.name, c.vat_number, c.iban, c.email].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
}

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
        <td><span class="badge rounded-pill ${TYPE_BADGE[c.type] || 'bg-secondary'}">${escHtml(TYPE_LABEL[c.type] || c.type)}</span></td>
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

function rerender() {
    const tbody = document.getElementById('contacts-tbody');
    const empty = document.getElementById('contacts-empty');
    if (!tbody) return;
    const filtered = applyFilters(cache.contacts);
    tbody.innerHTML = '';
    if (filtered.length === 0) {
        empty?.classList.remove('d-none');
    } else {
        empty?.classList.add('d-none');
        for (const c of filtered) tbody.appendChild(renderRow(c));
    }
    const countEl = document.getElementById('contacts-count');
    if (countEl) {
        const active = cache.contacts.filter(c => !c.archived).length;
        countEl.textContent = `${active} attivi`;
    }
}

// ── Caricamento dati ────────────────────────────────────────────────────────

async function loadAll() {
    const includeArchived = document.getElementById('filter-archived')?.checked ? 1 : 0;
    try {
        const [listResp, balanceResp] = await Promise.all([
            api.get(`${BASE}/contacts/list?include_archived=${includeArchived}&with_usage=1`),
            api.get(`${BASE}/contacts/balance?year=${new Date().getFullYear()}`),
        ]);
        cache.contacts = listResp?.data?.contacts ?? [];
        cache.balances = new Map();
        for (const b of (balanceResp?.data?.summary ?? [])) {
            cache.balances.set(b.contact_id, b);
        }
        rerender();
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento anagrafiche.');
    }
}

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
        form.querySelector('select[name="type"]').value       = contact.type ?? 'both';
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
        loadAll();
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
        loadAll();
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
            const contact = cache.contacts.find(c => c.id === id);
            if (contact) openModal(contact);
            return;
        }
        if (delBtn) {
            const contact = cache.contacts.find(c => c.id === id);
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
                cache.contacts = cache.contacts.filter(c => c.id !== id);
                cache.balances.delete(id);
                toast.success('Anagrafica eliminata.');
                rerender();
            } catch { /* toast handled */ }
        }
    });

    document.getElementById('filter-type')?.addEventListener('change', rerender);
    document.getElementById('filter-search')?.addEventListener('input', rerender);
    document.getElementById('filter-archived')?.addEventListener('change', loadAll);
}

document.addEventListener('DOMContentLoaded', () => {
    wire();
    loadAll();
});
