// ─── pages/accounts.js ───────────────────────────────────────────────────────
// Multi-conto: card grid con saldo live, create form, delete, archive toggle.

import FetchRequest                                           from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                       from '../componentBase.js';
import { toast }                                                from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';
import { fmtMoney } from '../format.js';

/** La valuta del conto di cui si sta guardando la riconciliazione. */
const valutaRiconciliazione = () => reconcileCurrentAccount?.currency;

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';


const TYPE_LABELS = {
    checking: 'Conto corrente', card: 'Carta', cash: 'Contanti',
    savings: 'Risparmi', investment: 'Investimenti',
    deposit: 'Deposito titoli', pac: 'Piano accumulo (PAC)',
    other: 'Altro',
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

    // Su un conto con un piano di accumulo il saldo dice solo quanto ci e'
    // entrato: le quote comprate valgono un altro numero, ed e' quello che
    // conta per sapere se ci stai guadagnando.
    let marketRow = '';
    if (a.market_value !== null && a.market_value !== undefined) {
        const g = Number(a.market_gain) || 0;
        const cls = g > 0 ? 'text-success' : (g < 0 ? 'text-danger' : 'text-muted');
        marketRow = `<div class="mt-2 pt-2 border-top">
            <div class="small text-muted">Valore delle quote</div>
            <div class="h5 mb-0">${fmtMoney(a.market_value, a.currency)}
                <span class="small ${cls}">${g > 0 ? '+' : ''}${fmtMoney(g, a.currency)}</span>
            </div>
        </div>`;
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
                <div class="display-6 fw-semibold mt-2 ${balCls}">${fmtMoney(a.balance, a.currency)}</div>
                <div class="small text-muted mt-1">
                    Iniziale ${fmtMoney(a.opening_balance, a.currency)} ·
                    Entrate ${fmtMoney(a.incomes_total, a.currency)} ·
                    Spese ${fmtMoney(a.expenses_total, a.currency)}
                </div>
                ${bankRow}
                ${marketRow}
                <div class="mt-3 text-end">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${a.id}" title="Modifica">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-success" data-action="reconcile" data-id="${a.id}" title="Riconcilia">
                        <i class="bi bi-check2-circle"></i>
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
        syncCashOnly(createForm);
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

function syncCashOnly(form) {
    if (!form) return;
    const isCash = form.elements['type']?.value === 'cash';
    form.querySelectorAll('[data-cash-only]').forEach(node => {
        node.style.display = isCash ? '' : 'none';
    });
    if (!isCash) {
        const cb = form.elements['is_default_cash'];
        if (cb) cb.checked = false;
    }
}

function bindCashOnly(form) {
    if (!form) return;
    const typeSel = form.elements['type'];
    if (typeSel) typeSel.addEventListener('change', () => syncCashOnly(form));
    syncCashOnly(form);
}

function openEditModal(a) {
    if (!editModal || !editForm) return;
    editForm.elements['id'].value              = a.id;
    editForm.elements['name'].value            = a.name ?? '';
    editForm.elements['type'].value            = a.type ?? 'checking';
    editForm.elements['color'].value           = a.color ?? '#0d6efd';
    editForm.elements['icon'].value            = a.icon ?? '';
    editForm.elements['opening_balance'].value = a.opening_balance ?? '0';
    editForm.elements['currency'].value = a.currency ?? 'EUR';
    editForm.elements['sort_order'].value      = a.sort_order ?? 0;
    editForm.elements['archived'].value        = Number(a.archived) === 1 ? '1' : '0';
    if (editForm.elements['is_default_cash']) {
        editForm.elements['is_default_cash'].checked = Number(a.is_default_cash) === 1;
    }
    if (editForm.elements['bank_profile_id']) {
        editForm.elements['bank_profile_id'].value = a.bank_profile_id ?? '';
    }
    for (const f of DETAIL_FIELDS) {
        if (editForm.elements[f]) editForm.elements[f].value = a[f] ?? '';
    }
    syncCashOnly(editForm);
    if (typeof editModal.showModal === 'function') editModal.showModal();
    else editModal.setAttribute('open', '');
}

bindCashOnly(createForm);
bindCashOnly(editForm);

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
                opening_balance: a.opening_balance, currency: a.currency, sort_order: a.sort_order,
                archived: Number(a.archived) === 1 ? 0 : 1,
                is_default_cash: Number(a.is_default_cash) === 1 ? 1 : 0,
                // Anche i campi che non c'entrano con l'archiviazione: questa
                // update riscrive la riga intera, e quel che manca si azzera.
                bank_profile_id: a.bank_profile_id ?? '',
                ...detailsPayload(a),
            });
            toast.success(Number(a.archived) === 1 ? 'Conto ripristinato.' : 'Conto archiviato.');
            loadList();
        } catch (err) {
            toast.error(err.message ?? 'Errore archiviazione.');
        }
    } else if (btn.dataset.action === 'edit') {
        openEditModal(a);
    } else if (btn.dataset.action === 'reconcile') {
        openReconcileModal(a);
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

// ─── Riconciliazione conti ────────────────────────────────────────────────────
const reconcileModal   = document.getElementById('account-reconcile-modal');
const reconcileForm    = document.getElementById('account-reconcile-form');
const reconcileHistory = document.getElementById('account-reconcile-history');
const reconcilePreview = document.getElementById('reconcile-preview');
const reconcileNameEl  = document.getElementById('reconcile-account-name');
const reconcileCalcEl  = document.getElementById('reconcile-calculated');

let reconcileCurrentAccount = null;

function todayIso() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function formatDateIt(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseAmountIt(raw) {
    if (raw === null || raw === undefined) return NaN;
    const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

function updateReconcilePreview() {
    if (!reconcileCurrentAccount || !reconcilePreview) return;
    const declared = parseAmountIt(reconcileForm?.elements['declared_balance']?.value);
    const calculated = Number(reconcileCurrentAccount.balance) || 0;

    if (!Number.isFinite(declared)) {
        reconcilePreview.className = 'alert alert-secondary small mb-0 py-2';
        reconcilePreview.textContent = 'Inserisci il saldo reale per vedere la differenza.';
        return;
    }

    const diff = Math.round((declared - calculated) * 100) / 100;
    if (diff === 0) {
        reconcilePreview.className = 'alert alert-secondary small mb-0 py-2';
        reconcilePreview.innerHTML = '<i class="bi bi-check-circle me-1"></i>'
            + 'Nessuna differenza: verrà registrata la verifica senza generare movimenti.';
    } else if (diff > 0) {
        reconcilePreview.className = 'alert alert-success small mb-0 py-2';
        reconcilePreview.innerHTML = `<i class="bi bi-arrow-up-circle me-1"></i>`
            + `Differenza: <strong>+${fmtMoney(diff, reconcileCurrentAccount?.currency)}</strong> → verrà creata un'<strong>entrata di rettifica</strong>.`;
    } else {
        reconcilePreview.className = 'alert alert-warning small mb-0 py-2';
        reconcilePreview.innerHTML = `<i class="bi bi-arrow-down-circle me-1"></i>`
            + `Differenza: <strong>${fmtMoney(diff, reconcileCurrentAccount?.currency)}</strong> → verrà creata una <strong>spesa di rettifica</strong>.`;
    }
}

function openReconcileModal(a) {
    if (!reconcileModal || !reconcileForm) return;
    reconcileCurrentAccount = a;
    reconcileNameEl.textContent = a.name ? `· ${a.name}` : '';
    reconcileCalcEl.value = fmtMoney(a.balance, a.currency);
    reconcileForm.elements['account_id'].value = a.id;
    reconcileForm.elements['declared_balance'].value = '';
    reconcileForm.elements['reconciled_at'].value = todayIso();
    reconcileForm.elements['reconciled_at'].max = todayIso();
    reconcileForm.elements['notes'].value = '';
    updateReconcilePreview();
    loadReconciliationHistory(a.id);

    if (typeof reconcileModal.showModal === 'function') reconcileModal.showModal();
    else reconcileModal.setAttribute('open', '');
}

function closeReconcileModal() {
    if (!reconcileModal) return;
    if (typeof reconcileModal.close === 'function') reconcileModal.close();
    else reconcileModal.removeAttribute('open');
}

async function loadReconciliationHistory(accountId) {
    if (!reconcileHistory) return;
    reconcileHistory.innerHTML = '<div class="text-muted">Caricamento...</div>';
    try {
        const r = await apiGuard(api.get(`${BASE}/accounts/reconciliations`, { account_id: accountId }));
        const items = r.data?.reconciliations ?? [];
        if (!items.length) {
            reconcileHistory.innerHTML = '<div class="text-muted">Nessuna riconciliazione registrata.</div>';
            return;
        }
        reconcileHistory.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th class="text-end">Dichiarato</th>
                            <th class="text-end">Calcolato</th>
                            <th class="text-end">Differenza</th>
                            <th>Esito</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(renderHistoryRow).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (err) {
        reconcileHistory.innerHTML = `<div class="text-danger">${escapeHtml(err.message ?? 'Errore caricamento storico.')}</div>`;
    }
}

function renderHistoryRow(r) {
    const diff = Number(r.difference) || 0;
    let badge;
    if (r.adjustment_type === 'income') {
        const removed = (r.adjustment_income_id && r.income_amount === null);
        badge = removed
            ? '<span class="badge bg-secondary">entrata · rimossa</span>'
            : '<span class="badge bg-success">entrata di rettifica</span>';
    } else if (r.adjustment_type === 'expense') {
        const removed = (r.adjustment_expense_id && r.expense_amount === null);
        badge = removed
            ? '<span class="badge bg-secondary">spesa · rimossa</span>'
            : '<span class="badge bg-warning text-dark">spesa di rettifica</span>';
    } else {
        badge = '<span class="badge bg-light text-dark border">verifica OK</span>';
    }
    const diffCls = diff > 0 ? 'text-success' : (diff < 0 ? 'text-danger' : 'text-muted');
    const diffSign = diff > 0 ? '+' : '';
    const noteLine = r.notes
        ? `<div class="text-muted small">${escapeHtml(String(r.notes))}</div>`
        : '';
    return `
        <tr>
            <td>${formatDateIt(r.reconciled_at)}${noteLine}</td>
            <td class="text-end">${fmtMoney(r.declared_balance, valutaRiconciliazione())}</td>
            <td class="text-end">${fmtMoney(r.calculated_balance, valutaRiconciliazione())}</td>
            <td class="text-end ${diffCls}"><strong>${diffSign}${fmtMoney(diff, valutaRiconciliazione())}</strong></td>
            <td>${badge}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger"
                        data-recon-history-action="delete" data-id="${r.id}" title="Rimuovi dallo storico">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`;
}

if (reconcileModal) {
    reconcileModal.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-recon-action="close"]');
        if (btn) { ev.preventDefault(); closeReconcileModal(); }
    });
}

if (reconcileForm) {
    reconcileForm.addEventListener('input', (ev) => {
        if (ev.target?.name === 'declared_balance') updateReconcilePreview();
    });

    reconcileForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(reconcileForm);
        const declaredRaw = String(fd.get('declared_balance') ?? '').replace(',', '.');
        fd.set('declared_balance', declaredRaw);
        try {
            const r = await send(`${BASE}/accounts/reconcile`, Object.fromEntries(fd.entries()));
            const newBal = Number(r.data?.new_balance);
            toast.success(`Conto riconciliato (saldo allineato a ${fmtMoney(newBal, reconcileCurrentAccount?.currency)}).`);
            const accountId = Number(reconcileForm.elements['account_id'].value);
            await loadList();
            const fresh = cache.find(x => Number(x.id) === accountId);
            if (fresh) {
                reconcileCurrentAccount = fresh;
                reconcileCalcEl.value = fmtMoney(fresh.balance, fresh.currency);
            }
            reconcileForm.elements['declared_balance'].value = '';
            updateReconcilePreview();
            await loadReconciliationHistory(accountId);
        } catch (err) {
            toast.error(err.message ?? 'Errore riconciliazione.');
        }
    });
}

if (reconcileHistory) {
    reconcileHistory.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button[data-recon-history-action="delete"]');
        if (!btn) return;
        const id = btn.dataset.id;
        const ok = await confirmDialog(
            'Rimuovere questa riga dallo storico? Il movimento di rettifica già generato resterà invariato.',
            { confirmText: 'Rimuovi', confirmClass: 'btn-danger' }
        );
        if (!ok) return;
        try {
            await send(`${BASE}/accounts/reconciliation/delete`, { id });
            toast.success('Riga rimossa dallo storico.');
            const accountId = Number(reconcileForm.elements['account_id'].value);
            if (accountId) await loadReconciliationHistory(accountId);
        } catch (err) {
            toast.error(err.message ?? 'Errore rimozione.');
        }
    });
}
