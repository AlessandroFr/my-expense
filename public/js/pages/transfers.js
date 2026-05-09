// ─── pages/transfers.js ──────────────────────────────────────────────────────
// Trasferimenti atomici fra conti: form, lista, delete.

import FetchRequest                                       from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                  from '../componentBase.js';
import { toast }                                          from '../toast.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    return dateFmt.format(new Date(Number(y), Number(m) - 1, Number(d)));
};

const createForm = document.getElementById('transfer-create-form');
const listEl     = document.getElementById('transfers-list');
const fromInput  = document.getElementById('transfers-filter-date-from');
const toInput    = document.getElementById('transfers-filter-date-to');

let accountsCache = [];
let transfersCache = [];

async function loadAccounts() {
    try {
        const r = await apiGuard(api.get(`${BASE}/accounts/list`, { include_archived: 0 }));
        accountsCache = (r.data?.accounts ?? []).filter(a => Number(a.archived) === 0);
        const optionsHtml = ['<option value="">Seleziona…</option>']
            .concat(accountsCache.map(a => {
                const balance = a.balance != null ? ` — ${fmtMoney(a.balance)}` : '';
                return `<option value="${escapeAttr(a.id)}">${escapeHtml(a.name)}${escapeHtml(balance)}</option>`;
            })).join('');
        for (const sel of createForm.querySelectorAll('select[data-role]')) {
            sel.innerHTML = optionsHtml;
        }
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento conti.');
    }
}

function renderRow(t) {
    return `
        <tr data-id="${escapeAttr(t.id)}">
            <td class="text-nowrap">${escapeHtml(fmtDate(t.transfer_date))}</td>
            <td>
                <span class="badge me-1" style="background:${escapeAttr(t.source_color || '#6c757d')}">
                    <i class="bi bi-${escapeHtml(t.source_icon || 'bank')}"></i>
                </span>
                ${escapeHtml(t.source_name || '')}
            </td>
            <td class="text-center text-muted"><i class="bi bi-arrow-right"></i></td>
            <td>
                <span class="badge me-1" style="background:${escapeAttr(t.destination_color || '#6c757d')}">
                    <i class="bi bi-${escapeHtml(t.destination_icon || 'bank')}"></i>
                </span>
                ${escapeHtml(t.destination_name || '')}
            </td>
            <td class="text-end fw-semibold">${escapeHtml(fmtMoney(t.amount))}</td>
            <td>${escapeHtml(t.description || '')}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${escapeAttr(t.id)}" title="Elimina">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`;
}

async function loadList() {
    if (!listEl) return;
    listEl.innerHTML = `<div class="text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…</div>`;
    try {
        const params = {};
        if (fromInput?.value) params.date_from = fromInput.value;
        if (toInput?.value)   params.date_to   = toInput.value;
        const r = await apiGuard(api.get(`${BASE}/transfers/list`, params));
        transfersCache = r.data?.transfers ?? [];
        if (!transfersCache.length) {
            listEl.innerHTML = `<div class="text-center text-muted py-4">
                Nessun trasferimento ancora. Creane uno qui a fianco.</div>`;
            return;
        }
        listEl.innerHTML = `
            <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
                <thead>
                    <tr class="text-muted small">
                        <th>Data</th>
                        <th>Da</th>
                        <th></th>
                        <th>A</th>
                        <th class="text-end">Importo</th>
                        <th>Descrizione</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>${transfersCache.map(renderRow).join('')}</tbody>
            </table>
            </div>`;
    } catch (err) {
        listEl.innerHTML = `<div class="text-center text-danger py-4">
            ${escapeHtml(err.message ?? 'Errore caricamento.')}</div>`;
    }
}

createForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(createForm);
    const payload = Object.fromEntries(fd.entries());
    if (payload.source_account_id === payload.destination_account_id) {
        toast.error('Conto sorgente e destinazione devono essere diversi.');
        return;
    }
    try {
        await send(`${BASE}/transfers/create`, payload);
        toast.success('Trasferimento creato.');
        createForm.reset();
        const dateInput = createForm.querySelector('input[name="transfer_date"]');
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore creazione trasferimento.');
    }
});

listEl?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const t = transfersCache.find(x => String(x.id) === String(id));
    if (!t) return;
    const ok = await confirmDialog(
        `Eliminare il trasferimento di ${fmtMoney(t.amount)} da "${t.source_name}" a "${t.destination_name}"? Le scritture su spese ed entrate vengono rimosse in cascata.`,
        { confirmText: 'Elimina', confirmClass: 'btn-danger' }
    );
    if (!ok) return;
    try {
        await send(`${BASE}/transfers/delete`, { id });
        toast.success('Trasferimento eliminato.');
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore eliminazione.');
    }
});

fromInput?.addEventListener('change', loadList);
toInput?.addEventListener('change',   loadList);

loadAccounts().then(loadList);
