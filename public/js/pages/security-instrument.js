// ─── pages/security-instrument.js ─────────────────────────────────────────────
// Dettaglio strumento: storico prezzi, chart, lista transazioni, upsert quote.

import FetchRequest                                       from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                  from '../componentBase.js';
import { toast }                                          from '../toast.js';
import { fmtMoney, fmtNum } from '../format.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';
const ID   = Number(window.MX_INSTRUMENT_ID || 0);


const priceUpdateForm = document.getElementById('price-update-form');
const priceHistoryEl  = document.getElementById('price-history');
const txEl            = document.getElementById('instrument-transactions');
const chartCanvas     = document.getElementById('price-chart');

let priceCache = [];
let chart      = null;

async function loadPrices() {
    const r = await apiGuard(api.get(`${BASE}/securities/prices`, { instrument_id: ID }));
    priceCache = r.data?.prices ?? [];
    renderPriceList();
    renderChart();
}

function renderPriceList() {
    if (!priceCache.length) {
        priceHistoryEl.innerHTML = `<div class="text-center text-muted py-3">
            Nessuna quotazione registrata.</div>`;
        return;
    }
    const rows = priceCache.slice(0, 30).map(p => `
        <tr>
            <td>${escapeHtml(p.price_date)}</td>
            <td class="text-end">${escapeHtml(fmtNum(p.price, 6))}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-price" data-id="${escapeAttr(p.id)}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`).join('');
    priceHistoryEl.innerHTML = `
        <table class="table table-sm align-middle mb-0">
            <thead><tr class="small text-muted"><th>Data</th><th class="text-end">Prezzo</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function renderChart() {
    if (!chartCanvas) return;
    const sorted = [...priceCache].reverse();
    const labels = sorted.map(p => p.price_date);
    const data   = sorted.map(p => Number(p.price));
    if (chart) chart.destroy();
    if (!labels.length) {
        chartCanvas.parentElement.innerHTML = '<div class="text-center text-muted py-5">Aggiungi una quotazione per vedere il grafico.</div>';
        return;
    }
    chart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Prezzo',
                data,
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13,110,253,0.1)',
                tension: 0.25,
                fill: true,
                pointRadius: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: false } },
        },
    });
}

async function loadTransactions() {
    const r = await apiGuard(api.get(`${BASE}/securities/transactions/list`, { instrument_id: ID, limit: 200 }));
    const list = r.data?.transactions ?? [];
    if (!list.length) {
        txEl.innerHTML = `<div class="text-center text-muted py-3">Nessuna operazione su questo strumento.</div>`;
        return;
    }
    const rows = list.map(t => {
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
                <td class="text-end">${escapeHtml(qty)}</td>
                <td class="text-end">${escapeHtml(px)}</td>
                <td class="text-end fw-semibold">${escapeHtml(fmtMoney(t.net_amount))}</td>
                <td class="small text-muted">${escapeHtml(t.account_name || '')}</td>
            </tr>`;
    }).join('');
    txEl.innerHTML = `
        <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
            <thead><tr class="small text-muted">
                <th>Data</th><th>Tipo</th>
                <th class="text-end">Qty</th><th class="text-end">Prezzo</th>
                <th class="text-end">Netto</th><th>Conto</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;
}

priceUpdateForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(priceUpdateForm);
    try {
        await send(`${BASE}/securities/prices/update`, Object.fromEntries(fd.entries()));
        toast.success('Quotazione aggiornata.');
        priceUpdateForm.elements['price'].value = '';
        await loadPrices();
    } catch (err) {
        toast.error(err.message ?? 'Errore aggiornamento prezzo.');
    }
});

// ── Quotazioni da Internet ───────────────────────────────────────────────────

const priceFetchBtn = document.getElementById('price-fetch-btn');

priceFetchBtn?.addEventListener('click', async () => {
    const text = priceFetchBtn.innerHTML;
    priceFetchBtn.disabled = true;
    priceFetchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Scarico…';
    try {
        const r = await send(`${BASE}/securities/prices/fetch`, { instrument_id: ID });
        const d = r?.data ?? {};
        toast.success(d.saved > 0
            ? `${d.saved} quotazioni nuove da ${d.symbol} (${d.from_date} → ${d.to_date}).`
            : `Nessuna quotazione nuova: ${d.symbol} era già aggiornato.`);
        await loadPrices();
    } catch (err) {
        toast.error(err.message ?? 'Non sono riuscito a scaricare le quotazioni.');
    } finally {
        priceFetchBtn.disabled = false;
        priceFetchBtn.innerHTML = text;
    }
});

priceHistoryEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action="del-price"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const ok = await confirmDialog('Eliminare la quotazione?', { confirmText: 'Elimina', confirmClass: 'btn-danger' });
    if (!ok) return;
    try {
        await send(`${BASE}/securities/prices/delete`, { id, instrument_id: ID });
        toast.success('Quotazione eliminata.');
        await loadPrices();
    } catch (err) {
        toast.error(err.message ?? 'Errore eliminazione.');
    }
});

(async () => {
    if (!ID) {
        toast.error('ID strumento mancante.');
        return;
    }
    await Promise.all([loadPrices(), loadTransactions()]);
})();
