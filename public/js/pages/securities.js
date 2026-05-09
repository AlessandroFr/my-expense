// ─── pages/securities.js ─────────────────────────────────────────────────────
// Investimenti: holdings, transazioni, creazione strumenti.

import FetchRequest                                       from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                  from '../componentBase.js';
import { toast }                                          from '../toast.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);
const fmtNum   = (n, dec = 4) => (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: dec });

const accountFilter = document.getElementById('securities-account-filter');
const kpiEl         = document.getElementById('securities-kpi');
const holdingsEl    = document.getElementById('securities-holdings');
const txEl          = document.getElementById('securities-transactions');
const txForm        = document.getElementById('security-tx-form');
const instrModal    = document.getElementById('instrument-create-modal');
const instrForm     = document.getElementById('instrument-create-form');

let depositAccounts = [];
let allAccounts     = [];
let instruments     = [];
let assetClasses    = [];
let holdingsCache   = [];
let txCache         = [];

async function loadAccounts() {
    const r = await apiGuard(api.get(`${BASE}/accounts/list`, { include_archived: 0 }));
    allAccounts     = r.data?.accounts ?? [];
    depositAccounts = allAccounts.filter(a => a.type === 'deposit');

    accountFilter.innerHTML = depositAccounts.length === 0
        ? '<option value="">— nessun conto deposito —</option>'
        : '<option value="">Tutti i conti deposito</option>'
          + depositAccounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
}

async function loadAssetClasses() {
    const r = await apiGuard(api.get(`${BASE}/securities/asset-classes`, {}));
    assetClasses = r.data?.asset_classes ?? [];
    const opts = ['<option value="">—</option>']
        .concat(assetClasses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)).join('');
    instrForm.querySelector('select[data-role="asset-class"]').innerHTML = opts;

    const accSel = instrForm.querySelector('select[data-role="instrument-account"]');
    accSel.innerHTML = ['<option value="">Globale</option>']
        .concat(depositAccounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)).join('');
}

async function loadInstruments() {
    const accountId = accountFilter.value || '';
    const params    = accountId ? { account_id: accountId } : {};
    const r = await apiGuard(api.get(`${BASE}/securities/list`, params));
    instruments = r.data?.instruments ?? [];
    const sel = txForm.querySelector('select[data-role="instrument"]');
    sel.innerHTML = ['<option value="">Seleziona…</option>']
        .concat(instruments.map(i => {
            const ticker = i.ticker ? ` (${i.ticker})` : '';
            return `<option value="${i.id}">${escapeHtml(i.name)}${escapeHtml(ticker)}</option>`;
        })).join('');
}

async function loadHoldings() {
    const accountId = accountFilter.value || '';
    const params    = accountId ? { account_id: accountId } : {};
    holdingsEl.innerHTML = `<div class="text-center text-muted py-3">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…</div>`;
    const r = await apiGuard(api.get(`${BASE}/securities/holdings`, params));
    holdingsCache = r.data?.holdings ?? [];
    renderHoldings();
    renderKpi();
}

function renderHoldings() {
    if (!holdingsCache.length) {
        holdingsEl.innerHTML = `<div class="text-center text-muted py-3">
            Nessuna posizione. Registra un acquisto per iniziare.</div>`;
        return;
    }
    const rows = holdingsCache
        .filter(h => Number(h.qty) !== 0)
        .map(h => {
            const ticker = h.instrument_ticker ? `<span class="badge bg-secondary me-1">${escapeHtml(h.instrument_ticker)}</span>` : '';
            const cls    = h.asset_class_name ? `<span class="badge me-1" style="background:${escapeAttr(h.asset_class_color || '#6c757d')}">${escapeHtml(h.asset_class_name)}</span>` : '';
            const pnl    = h.total_pnl;
            const pnlCls = pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : 'text-muted');
            const mark   = h.mark_value !== null ? fmtMoney(h.mark_value) : '<span class="text-muted">—</span>';
            const last   = h.last_price !== null ? `${fmtNum(h.last_price, 4)} ${escapeHtml(h.currency || 'EUR')}` : '<span class="text-muted">manca prezzo</span>';
            const detailUrl = `${BASE}/securities/instrument?id=${h.instrument_id}`;
            return `
                <tr>
                    <td>
                        ${ticker}${cls}
                        <a href="${detailUrl}">${escapeHtml(h.instrument_name)}</a>
                        <div class="small text-muted">${escapeHtml(h.account_name || '')}</div>
                    </td>
                    <td class="text-end">${escapeHtml(fmtNum(h.qty, 6))}</td>
                    <td class="text-end">${escapeHtml(fmtNum(h.avg_cost, 4))} ${escapeHtml(h.currency || 'EUR')}</td>
                    <td class="text-end">${last}</td>
                    <td class="text-end fw-semibold">${mark}</td>
                    <td class="text-end ${pnlCls}">${escapeHtml(fmtMoney(pnl))}</td>
                </tr>`;
        }).join('');
    holdingsEl.innerHTML = `
        <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
            <thead><tr class="small text-muted">
                <th>Strumento</th>
                <th class="text-end">Qty</th>
                <th class="text-end">P&M</th>
                <th class="text-end">Ultimo</th>
                <th class="text-end">Valore</th>
                <th class="text-end">P&L</th>
            </tr></thead>
            <tbody>${rows || '<tr><td colspan="6" class="text-center text-muted">Nessuna posizione aperta.</td></tr>'}</tbody>
        </table>
        </div>`;
}

function renderKpi() {
    if (!holdingsCache.length) {
        kpiEl.innerHTML = '';
        return;
    }
    let invested = 0, current = 0, dividends = 0, pnl = 0, hasMarked = false;
    for (const h of holdingsCache) {
        invested += (h.qty * h.avg_cost);
        if (h.mark_value !== null) { current += h.mark_value; hasMarked = true; }
        dividends += h.dividends || 0;
        pnl       += h.total_pnl || 0;
    }
    const pnlCls = pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : 'text-muted');
    const currentDisplay = hasMarked ? fmtMoney(current) : '<span class="text-muted">manca prezzo</span>';
    kpiEl.innerHTML = `
        <div class="col-6 col-md-3">
          <div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Capitale investito</div>
            <div class="h5 mb-0">${escapeHtml(fmtMoney(invested))}</div>
          </div></div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Valore attuale</div>
            <div class="h5 mb-0">${currentDisplay}</div>
          </div></div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">P&L totale</div>
            <div class="h5 mb-0 ${pnlCls}">${escapeHtml(fmtMoney(pnl))}</div>
          </div></div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Dividendi totali</div>
            <div class="h5 mb-0">${escapeHtml(fmtMoney(dividends))}</div>
          </div></div>
        </div>`;
}

async function loadTransactions() {
    const accountId = accountFilter.value || '';
    const params    = { limit: 50 };
    if (accountId) params.account_id = accountId;
    const r = await apiGuard(api.get(`${BASE}/securities/transactions/list`, params));
    txCache = r.data?.transactions ?? [];
    if (!txCache.length) {
        txEl.innerHTML = `<div class="text-center text-muted py-3">Nessuna operazione registrata.</div>`;
        return;
    }
    const rows = txCache.map(t => {
        const kindBadge = {
            BUY:      '<span class="badge bg-primary">Acq.</span>',
            SELL:     '<span class="badge bg-warning text-dark">Vend.</span>',
            DIVIDEND: '<span class="badge bg-success">Div.</span>',
            FEE:      '<span class="badge bg-secondary">Fee</span>',
            SPLIT:    '<span class="badge bg-info">Split</span>',
        }[t.kind] || `<span class="badge bg-secondary">${escapeHtml(t.kind)}</span>`;
        const qty = ['BUY','SELL','SPLIT'].includes(t.kind) ? fmtNum(t.quantity, 6) : '';
        const px  = ['BUY','SELL'].includes(t.kind) ? fmtNum(t.price, 4) : '';
        return `
            <tr>
                <td class="text-nowrap">${escapeHtml(t.trade_date)}</td>
                <td>${kindBadge}</td>
                <td>${escapeHtml(t.instrument_name || '')}</td>
                <td class="text-end">${escapeHtml(qty)}</td>
                <td class="text-end">${escapeHtml(px)}</td>
                <td class="text-end fw-semibold">${escapeHtml(fmtMoney(t.net_amount))}</td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-tx" data-id="${escapeAttr(t.id)}" title="Elimina">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
    txEl.innerHTML = `
        <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
            <thead><tr class="small text-muted">
                <th>Data</th><th>Tipo</th><th>Strumento</th>
                <th class="text-end">Qty</th><th class="text-end">Prezzo</th>
                <th class="text-end">Netto</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;
}

function syncTxForm() {
    const kind = txForm.elements['kind'].value;
    txForm.querySelectorAll('[data-show-for]').forEach(node => {
        const list = node.dataset.showFor.split(',').map(s => s.trim());
        node.classList.toggle('d-none', !list.includes(kind));
    });
    const priceLabel = txForm.querySelector('[data-label-for="price"]');
    if (priceLabel) {
        priceLabel.textContent = (kind === 'DIVIDEND' || kind === 'FEE')
            ? 'Importo lordo' : 'Prezzo';
    }
}
txForm.elements['kind'].addEventListener('change', syncTxForm);
syncTxForm();

txForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const accountId = accountFilter.value;
    if (!accountId) {
        toast.error('Seleziona un conto deposito sopra a destra.');
        return;
    }
    const fd = new FormData(txForm);
    const payload = Object.fromEntries(fd.entries());
    payload.account_id = accountId;
    try {
        await send(`${BASE}/securities/transactions/create`, payload);
        toast.success('Operazione registrata.');
        txForm.reset();
        const dateInput = txForm.querySelector('input[name="trade_date"]');
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        txForm.elements['fee'].value = '0';
        syncTxForm();
        await Promise.all([loadHoldings(), loadTransactions()]);
    } catch (err) {
        toast.error(err.message ?? 'Errore registrazione operazione.');
    }
});

txEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action="del-tx"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const t = txCache.find(x => String(x.id) === String(id));
    if (!t) return;
    const ok = await confirmDialog(
        `Eliminare l'operazione ${t.kind} su ${t.instrument_name}? La scrittura contabile collegata verra' rimossa.`,
        { confirmText: 'Elimina', confirmClass: 'btn-danger' }
    );
    if (!ok) return;
    try {
        await send(`${BASE}/securities/transactions/delete`, { id });
        toast.success('Operazione eliminata.');
        await Promise.all([loadHoldings(), loadTransactions()]);
    } catch (err) {
        toast.error(err.message ?? 'Errore eliminazione.');
    }
});

function openInstrModal()  {
    if (!instrModal) return;
    if (typeof instrModal.showModal === 'function') instrModal.showModal();
    else instrModal.setAttribute('open', '');
}
function closeInstrModal() {
    if (!instrModal) return;
    if (typeof instrModal.close === 'function') instrModal.close();
    else instrModal.removeAttribute('open');
}
document.addEventListener('click', (ev) => {
    const link = ev.target.closest('a[data-action="new-instrument"]');
    if (link) { ev.preventDefault(); openInstrModal(); return; }
    const close = ev.target.closest('[data-instr-action="close"]');
    if (close) { closeInstrModal(); }
});

instrForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const accountId = accountFilter.value;
    const fd = new FormData(instrForm);
    const payload = Object.fromEntries(fd.entries());
    if (!payload.account_id && accountId) payload.account_id = accountId;
    try {
        const r = await send(`${BASE}/securities/instrument/create`, payload);
        toast.success('Strumento creato.');
        instrForm.reset();
        instrForm.elements['currency'].value = 'EUR';
        closeInstrModal();
        await loadInstruments();
        const newId = r.data?.instrument?.id;
        if (newId) txForm.elements['instrument_id'].value = String(newId);
    } catch (err) {
        toast.error(err.message ?? 'Errore creazione strumento.');
    }
});

accountFilter.addEventListener('change', async () => {
    await Promise.all([loadInstruments(), loadHoldings(), loadTransactions()]);
});

(async () => {
    try {
        await loadAccounts();
        if (depositAccounts.length === 0) {
            kpiEl.innerHTML = `<div class="col-12">
                <div class="alert alert-info mb-0">
                    Per usare gli investimenti crea prima un conto di tipo <b>Deposito titoli</b>
                    in <a href="${BASE}/accounts">Conti</a>.
                </div></div>`;
            holdingsEl.innerHTML = '';
            txEl.innerHTML = '';
            return;
        }
        if (depositAccounts.length === 1) {
            accountFilter.value = String(depositAccounts[0].id);
        }
        await loadAssetClasses();
        await loadInstruments();
        await Promise.all([loadHoldings(), loadTransactions()]);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento investimenti.');
    }
})();
