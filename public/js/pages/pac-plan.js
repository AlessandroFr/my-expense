// ─── pages/pac-plan.js ───────────────────────────────────────────────────────
// Dettaglio piano PAC: KPI, versamenti, NAV, "genera ora".

import FetchRequest                                       from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                  from '../componentBase.js';
import { toast }                                          from '../toast.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';
const PLAN = window.MX_PLAN || {};

const moneyFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);
const fmtNum   = (n, dec = 4) => (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: dec });

const kpiEl       = document.getElementById('plan-kpi');
const contribForm = document.getElementById('contribution-create-form');
const navForm     = document.getElementById('nav-update-form');
const contribsEl  = document.getElementById('contributions-list');
const navHistEl   = document.getElementById('nav-history');
const runNowBtn   = document.getElementById('plan-run-now');

let contributions = [];

async function loadContributions() {
    contribsEl.innerHTML = `<div class="text-center text-muted py-3">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…</div>`;
    const r = await apiGuard(api.get(`${BASE}/pac/contributions`, { plan_id: PLAN.id, limit: 200 }));
    contributions = r.data?.contributions ?? [];
    renderKpi();
    if (!contributions.length) {
        contribsEl.innerHTML = `<div class="text-center text-muted py-3">
            Nessun versamento. Usa "Genera ora" o registra un versamento manuale.</div>`;
        return;
    }
    const rows = contributions.map(c => {
        const sourceBadge = {
            auto:   '<span class="badge bg-info">Auto</span>',
            manual: '<span class="badge bg-secondary">Manuale</span>',
            import: '<span class="badge bg-success">Estratto conto</span>',
        }[c.source] || `<span class="badge bg-secondary">${escapeHtml(c.source)}</span>`;
        const units = c.units !== null ? fmtNum(c.units, 6) : '<span class="text-muted">manca NAV</span>';
        const nav   = c.nav   !== null ? fmtNum(c.nav,   6) : '—';
        return `
            <tr>
                <td class="text-nowrap">${escapeHtml(c.contribution_date)}</td>
                <td>${sourceBadge}</td>
                <td class="text-end fw-semibold">${escapeHtml(fmtMoney(c.amount))}</td>
                <td class="text-end">${escapeHtml(nav)}</td>
                <td class="text-end">${units}</td>
                <td class="small text-muted">${escapeHtml(c.notes || '')}</td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-contrib" data-id="${escapeAttr(c.id)}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
    contribsEl.innerHTML = `
        <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
            <thead><tr class="small text-muted">
                <th>Data</th><th>Origine</th>
                <th class="text-end">Importo</th>
                <th class="text-end">NAV</th>
                <th class="text-end">Quote</th>
                <th>Note</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;
}

function renderKpi() {
    let total = 0, units = 0;
    for (const c of contributions) {
        total += Number(c.amount) || 0;
        units += Number(c.units)  || 0;
    }
    kpiEl.innerHTML = `
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Versato totale</div>
            <div class="h5 mb-0">${escapeHtml(fmtMoney(total))}</div>
        </div></div></div>
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Quote possedute</div>
            <div class="h5 mb-0">${escapeHtml(fmtNum(units, 6))}</div>
        </div></div></div>
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted"># versamenti</div>
            <div class="h5 mb-0">${contributions.length}</div>
        </div></div></div>
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Versamento</div>
            <div class="h5 mb-0">${escapeHtml(fmtMoney(PLAN.amount))}</div>
        </div></div></div>`;
}

async function loadNavHistory() {
    const r = await apiGuard(api.get(`${BASE}/pac/funds/navs`, { fund_id: PLAN.fund_id }));
    const list = r.data?.navs ?? [];
    if (!list.length) {
        navHistEl.innerHTML = `<div class="text-muted small">Nessun NAV registrato.</div>`;
        return;
    }
    const rows = list.slice(0, 10).map(n => `
        <tr>
            <td>${escapeHtml(n.nav_date)}</td>
            <td class="text-end">${escapeHtml(fmtNum(n.nav, 6))}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-nav" data-id="${escapeAttr(n.id)}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`).join('');
    navHistEl.innerHTML = `
        <table class="table table-sm align-middle mb-0">
            <thead><tr class="small text-muted"><th>Data</th><th class="text-end">NAV</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

contribForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(contribForm);
    try {
        await send(`${BASE}/pac/contributions/create`, Object.fromEntries(fd.entries()));
        toast.success('Versamento registrato.');
        await Promise.all([loadContributions(), loadNavHistory()]);
    } catch (err) {
        toast.error(err.message ?? 'Errore registrazione versamento.');
    }
});

navForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(navForm);
    try {
        await send(`${BASE}/pac/funds/nav-update`, Object.fromEntries(fd.entries()));
        toast.success('NAV aggiornato.');
        navForm.elements['nav'].value = '';
        await Promise.all([loadContributions(), loadNavHistory()]);
    } catch (err) {
        toast.error(err.message ?? 'Errore aggiornamento NAV.');
    }
});

contribsEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action="del-contrib"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const c = contributions.find(x => String(x.id) === String(id));
    if (!c) return;
    const ok = await confirmDialog(
        `Eliminare il versamento del ${c.contribution_date} (${fmtMoney(c.amount)})? Il Transfer collegato verra' rimosso.`,
        { confirmText: 'Elimina', confirmClass: 'btn-danger' }
    );
    if (!ok) return;
    try {
        await send(`${BASE}/pac/contributions/delete`, { id });
        toast.success('Versamento eliminato.');
        await loadContributions();
    } catch (err) {
        toast.error(err.message ?? 'Errore eliminazione.');
    }
});

navHistEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action="del-nav"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const ok = await confirmDialog('Eliminare il NAV?', { confirmText: 'Elimina', confirmClass: 'btn-danger' });
    if (!ok) return;
    try {
        await send(`${BASE}/pac/funds/nav-delete`, { id, fund_id: PLAN.fund_id });
        toast.success('NAV eliminato.');
        await loadNavHistory();
    } catch (err) {
        toast.error(err.message ?? 'Errore eliminazione.');
    }
});

runNowBtn?.addEventListener('click', async () => {
    try {
        const r = await send(`${BASE}/pac/plans/run`, { id: PLAN.id });
        toast.success(`Versamenti generati: ${r.data?.created ?? 0}.`);
        await loadContributions();
    } catch (err) {
        toast.error(err.message ?? 'Errore generazione.');
    }
});

(async () => {
    if (!PLAN.id) {
        toast.error('Piano non identificato.');
        return;
    }
    await Promise.all([loadContributions(), loadNavHistory()]);
})();
