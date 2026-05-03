// ─── pages/accounts.js ───────────────────────────────────────────────────────
// Multi-conto: card grid con saldo live, create form, delete, archive toggle.

import FetchRequest                                           from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                       from '../componentBase.js';
import { toast }                                                from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const TYPE_LABELS = {
    checking: 'Conto corrente', card: 'Carta', cash: 'Contanti',
    savings: 'Risparmi', investment: 'Investimenti', other: 'Altro',
};

const DETAIL_FIELDS = ['iban', 'bic', 'bank_name', 'account_holder', 'account_number', 'notes'];

const list       = document.getElementById('accounts-list');
const createForm = document.getElementById('account-create-form');
const editModal  = document.getElementById('account-edit-modal');
const editForm   = document.getElementById('account-edit-form');

function renderCard(a) {
    const icon = a.icon ? `<i class="bi bi-${escapeHtml(a.icon)}"></i>` : '<i class="bi bi-bank"></i>';
    const balCls = a.balance > 0 ? 'text-success' : (a.balance < 0 ? 'text-danger' : 'text-muted');
    const archivedBadge = Number(a.archived) === 1
        ? '<span class="badge bg-secondary ms-2">archiviato</span>' : '';

    let bankRow = '';
    if (a.iban || a.bank_name) {
        const last4 = a.iban ? `···· ${escapeHtml(String(a.iban).slice(-4))}` : '';
        const bank  = a.bank_name ? escapeHtml(a.bank_name) : '';
        const sep   = (last4 && bank) ? ' · ' : '';
        bankRow = `<div class="small text-muted mt-1"><i class="bi bi-bank2 me-1"></i>${last4}${sep}${bank}</div>`;
    }

    return `
    <div class="col-md-6 col-lg-4">
        <div class="card shadow-sm h-100" style="border-top:4px solid ${escapeAttr(a.color)}">
            <div class="card-body">
                <div class="d-flex align-items-center mb-2">
                    <span class="badge me-2" style="background:${escapeAttr(a.color)}">${icon}</span>
                    <strong class="flex-grow-1">${escapeHtml(a.name)}${archivedBadge}</strong>
                </div>
                <div class="text-muted small">${TYPE_LABELS[a.type] ?? escapeHtml(a.type)}</div>
                <div class="display-6 fw-semibold mt-2 ${balCls}">${fmtMoney(a.balance)}</div>
                <div class="small text-muted mt-1">
                    Iniziale ${fmtMoney(a.opening_balance)} ·
                    Entrate ${fmtMoney(a.incomes_total)} ·
                    Spese ${fmtMoney(a.expenses_total)}
                </div>
                ${bankRow}
                <div class="mt-3 text-end">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${a.id}" title="Modifica">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-action="archive" data-id="${a.id}">
                        <i class="bi ${Number(a.archived)===1 ? 'bi-archive-fill' : 'bi-archive'}"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${a.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

let cache = [];

async function loadList() {
    list.innerHTML = `<div class="col-12 text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento...</div>`;
    try {
        const r = await apiGuard(api.get(`${BASE}/accounts/list`, { include_archived: 1 }));
        cache = r.data?.accounts ?? [];
        if (!cache.length) {
            list.innerHTML = `<div class="col-12 text-center text-muted py-4">
                Nessun conto. Aggiungine uno qui sopra.</div>`;
            return;
        }
        list.innerHTML = cache.map(renderCard).join('');
        stagger(list);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento conti.');
    }
}

createForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(createForm);
    try {
        await send(`${BASE}/accounts/create`, Object.fromEntries(fd.entries()));
        toast.success('Conto aggiunto.');
        createForm.reset();
        createForm.querySelector('input[name="opening_balance"]').value = '0';
        createForm.querySelector('input[name="color"]').value = '#0d6efd';
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore creazione conto.');
    }
});

function detailsPayload(a) {
    const out = {};
    for (const f of DETAIL_FIELDS) out[f] = a[f] ?? '';
    return out;
}

function openEditModal(a) {
    if (!editModal || !editForm) return;
    editForm.elements['id'].value              = a.id;
    editForm.elements['name'].value            = a.name ?? '';
    editForm.elements['type'].value            = a.type ?? 'checking';
    editForm.elements['color'].value           = a.color ?? '#0d6efd';
    editForm.elements['icon'].value            = a.icon ?? '';
    editForm.elements['opening_balance'].value = a.opening_balance ?? '0';
    editForm.elements['sort_order'].value      = a.sort_order ?? 0;
    editForm.elements['archived'].value        = Number(a.archived) === 1 ? '1' : '0';
    for (const f of DETAIL_FIELDS) {
        if (editForm.elements[f]) editForm.elements[f].value = a[f] ?? '';
    }
    if (typeof editModal.showModal === 'function') editModal.showModal();
    else editModal.setAttribute('open', '');
}

function closeEditModal() {
    if (!editModal) return;
    if (typeof editModal.close === 'function') editModal.close();
    else editModal.removeAttribute('open');
}

list.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const a  = cache.find(x => x.id == id);
    if (!a) return;

    if (btn.dataset.action === 'delete') {
        const ok = await confirmDialog(
            `Eliminare "${a.name}"? Spese ed entrate associate resteranno (senza conto).`,
            { confirmText: 'Elimina', confirmClass: 'btn-danger' }
        );
        if (!ok) return;
        try {
            await send(`${BASE}/accounts/delete`, { id });
            toast.success('Conto eliminato.');
            loadList();
        } catch (err) {
            toast.error(err.message ?? 'Errore eliminazione.');
        }
    } else if (btn.dataset.action === 'archive') {
        try {
            await send(`${BASE}/accounts/update`, {
                id, name: a.name, type: a.type, color: a.color, icon: a.icon ?? '',
                opening_balance: a.opening_balance, sort_order: a.sort_order,
                archived: Number(a.archived) === 1 ? 0 : 1,
                ...detailsPayload(a),
            });
            toast.success(Number(a.archived) === 1 ? 'Conto ripristinato.' : 'Conto archiviato.');
            loadList();
        } catch (err) {
            toast.error(err.message ?? 'Errore archiviazione.');
        }
    } else if (btn.dataset.action === 'edit') {
        openEditModal(a);
    }
});

if (editModal) {
    editModal.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-edit-action="close"]');
        if (btn) { ev.preventDefault(); closeEditModal(); }
    });
}

if (editForm) {
    editForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(editForm);
        try {
            await send(`${BASE}/accounts/update`, Object.fromEntries(fd.entries()));
            toast.success('Conto aggiornato.');
            closeEditModal();
            loadList();
        } catch (err) {
            toast.error(err.message ?? 'Errore aggiornamento.');
        }
    });
}

document.addEventListener('DOMContentLoaded', loadList);
