// ─── pages/transfers.js ──────────────────────────────────────────────────────
// Trasferimenti atomici fra conti: form, lista, delete.

import FetchRequest                                       from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                  from '../componentBase.js';
import { toast }                                          from '../toast.js';
import { renderPager }                                    from '../pager.js';
import { fmtDate, fmtMoney } from '../format.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';


const createForm   = document.getElementById('transfer-create-form');
const editForm     = document.getElementById('transfer-edit-form');
const editModalEl  = document.getElementById('transfer-edit-modal');
const backfillBtn  = document.getElementById('transfers-backfill-btn');
const listEl       = document.getElementById('transfers-list');
const pagerEl      = document.getElementById('transfers-pager');
const fromInput    = document.getElementById('transfers-filter-date-from');
const toInput      = document.getElementById('transfers-filter-date-to');

const PAGE_SIZE_OPTIONS  = [10, 25, 50, 100];
const PAGE_SIZE_KEY      = 'mx-transfers-page-size';

function loadStoredPageSize() {
    try {
        const v = Number(localStorage.getItem(PAGE_SIZE_KEY));
        return PAGE_SIZE_OPTIONS.includes(v) ? v : 25;
    } catch { return 25; }
}

let accountsCache  = [];
let transfersCache = [];
let editModal      = null; // bootstrap.Modal, lazy-init
let pageLimit      = loadStoredPageSize();
let pageOffset     = 0;

async function loadAccounts() {
    try {
        const r = await apiGuard(api.get(`${BASE}/accounts/list`, { include_archived: 0 }));
        accountsCache = (r.data?.accounts ?? []).filter(a => Number(a.archived) === 0);
        const optionsHtml = ['<option value="">Seleziona…</option>']
            .concat(accountsCache.map(a => {
                const balance = a.balance != null ? ` — ${fmtMoney(a.balance)}` : '';
                return `<option value="${escapeAttr(a.id)}" data-name="${escapeAttr(a.name)}">${escapeHtml(a.name)}${escapeHtml(balance)}</option>`;
            })).join('');
        for (const sel of createForm.querySelectorAll('select[data-role]')) {
            sel.innerHTML = optionsHtml;
        }
        if (editForm) {
            for (const sel of editForm.querySelectorAll('select[data-role]')) {
                sel.innerHTML = optionsHtml;
            }
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
            <td class="text-end text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${escapeAttr(t.id)}" title="Modifica">
                    <i class="bi bi-pencil"></i>
                </button>
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
        const params = { limit: pageLimit, offset: pageOffset };
        if (fromInput?.value) params.date_from = fromInput.value;
        if (toInput?.value)   params.date_to   = toInput.value;
        const r = await apiGuard(api.get(`${BASE}/transfers/list`, params));
        transfersCache = r.data?.transfers ?? [];
        const total = Number(r.data?.total ?? transfersCache.length);

        if (total === 0) {
            listEl.innerHTML = `<div class="text-center text-muted py-4">
                Nessun trasferimento ancora. Creane uno qui a fianco.</div>`;
        } else {
            // Se la pagina e' fuori range (es. dopo delete dell'ultima riga)
            // riallinea offset a una pagina valida e ricarica.
            if (pageOffset > 0 && pageOffset >= total) {
                pageOffset = Math.max(0, (Math.ceil(total / pageLimit) - 1) * pageLimit);
                return loadList();
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
        }
        renderPager(pagerEl, {
            total, limit: pageLimit, offset: pageOffset,
            label: 'trasferimenti',
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onChange: (newOffset) => { pageOffset = newOffset; loadList(); },
            onLimitChange: (n) => {
                pageLimit  = n;
                pageOffset = 0;
                try { localStorage.setItem(PAGE_SIZE_KEY, String(n)); } catch {}
                loadList();
            },
        });
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
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const t = transfersCache.find(x => String(x.id) === String(id));
    if (!t) return;

    if (action === 'delete') {
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
        return;
    }

    if (action === 'edit') {
        openEditModal(t);
    }
});

// ─── Auto-causale ──────────────────────────────────────────────────────────
// Quando l'utente cambia uno dei due conti (sorgente/destinazione) in un form
// trasferimento, riscriviamo la "causale" — ma SOLO se segue uno dei pattern
// auto-generati dall'importer/service ("Ricarica → X", "Prelievo ATM → X",
// "Trasferimento verso X", "Trasferimento da X") oppure e' vuota. Una causale
// custom inserita a mano dall'utente viene preservata, per non sovrascrivere
// note tipo "versamento broker" quando si corregge il conto sbagliato.

const AUTO_CAUSALE_PATTERNS = [
    { test: /^Ricarica → /,             build: (s, d) => d ? `Ricarica → ${d}` : null },
    { test: /^Prelievo ATM → /,         build: (s, d) => d ? `Prelievo ATM → ${d}` : null },
    { test: /^Trasferimento verso /,    build: (s, d) => d ? `Trasferimento verso ${d}` : null },
    { test: /^Trasferimento da /,       build: (s)    => s ? `Trasferimento da ${s}`    : null },
];

function selectedAccountName(sel) {
    if (!sel) return '';
    const opt = sel.options?.[sel.selectedIndex];
    return opt?.dataset?.name ?? '';
}

function applyAutoCausale(form) {
    const descInput = form?.querySelector('input[name="description"]');
    const sourceSel = form?.querySelector('select[name="source_account_id"]');
    const destSel   = form?.querySelector('select[name="destination_account_id"]');
    if (!descInput || !sourceSel || !destSel) return;
    const sourceName = selectedAccountName(sourceSel);
    const destName   = selectedAccountName(destSel);
    const cur        = (descInput.value || '').trim();

    // Causale vuota: defaultiamo a "Trasferimento verso X" appena c'e' un dest.
    if (cur === '') {
        if (destName) descInput.value = `Trasferimento verso ${destName}`;
        return;
    }
    // Pattern conosciuto: rimpiazzo la parte variabile mantenendo il prefisso.
    for (const { test, build } of AUTO_CAUSALE_PATTERNS) {
        if (test.test(cur)) {
            const next = build(sourceName, destName);
            if (next !== null) descInput.value = next;
            return;
        }
    }
    // Causale custom: non tocco.
}

function wireAutoCausale(form) {
    if (!form) return;
    const sourceSel = form.querySelector('select[name="source_account_id"]');
    const destSel   = form.querySelector('select[name="destination_account_id"]');
    sourceSel?.addEventListener('change', () => applyAutoCausale(form));
    destSel?.addEventListener('change',   () => applyAutoCausale(form));
}

wireAutoCausale(createForm);
wireAutoCausale(editForm);

function openEditModal(t) {
    if (!editForm || !editModalEl) return;
    editForm.querySelector('#transfer-edit-id').value = String(t.id);
    editForm.querySelector('select[name="source_account_id"]').value      = String(t.source_account_id);
    editForm.querySelector('select[name="destination_account_id"]').value = String(t.destination_account_id);
    editForm.querySelector('input[name="amount"]').value        = String(t.amount).replace('.', ',');
    editForm.querySelector('input[name="transfer_date"]').value = String(t.transfer_date || '').slice(0, 10);
    editForm.querySelector('input[name="description"]').value   = t.description || '';
    editForm.querySelector('input[name="notes"]').value         = t.notes || '';
    if (!editModal && window.bootstrap?.Modal) {
        editModal = new window.bootstrap.Modal(editModalEl);
    }
    editModal?.show();
}

editForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(editForm);
    const payload = Object.fromEntries(fd.entries());
    if (payload.source_account_id === payload.destination_account_id) {
        toast.error('Conto sorgente e destinazione devono essere diversi.');
        return;
    }
    try {
        await send(`${BASE}/transfers/update`, payload);
        toast.success('Trasferimento aggiornato.');
        editModal?.hide();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore aggiornamento.');
    }
});

backfillBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog(
        'Cerco le coppie di expense+income importate dall\'estratto conto e le converto in trasferimenti veri (idempotente). Procedo?',
        { confirmText: 'Migra', confirmClass: 'btn-primary' }
    );
    if (!ok) return;
    backfillBtn.disabled = true;
    try {
        const r = await send(`${BASE}/transfers/backfill-imported`, {});
        const d = r?.data ?? {};
        const m = Number(d.migrated ?? 0);
        const np = Number(d.skipped_no_pair ?? 0);
        const mm = Number(d.skipped_mismatch ?? 0);
        if (m === 0 && np === 0 && mm === 0) {
            toast.success('Nessuna coppia da migrare.');
        } else {
            toast.success(`Migrati ${m}. Saltati: ${np} senza coppia, ${mm} con discrepanze.`);
        }
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore migrazione.');
    } finally {
        backfillBtn.disabled = false;
    }
});

fromInput?.addEventListener('change', () => { pageOffset = 0; loadList(); });
toInput?.addEventListener('change',   () => { pageOffset = 0; loadList(); });

loadAccounts().then(loadList);
