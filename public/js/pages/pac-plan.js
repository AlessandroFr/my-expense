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

/** Una casella dei numeri in cima alla pagina. */
const kpi = (titolo, valore, dettaglio = '', classe = '') => `
    <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
        <div class="small text-muted">${escapeHtml(titolo)}</div>
        <div class="h5 mb-0 ${classe}">${valore}</div>
        ${dettaglio ? `<div class="small text-muted">${dettaglio}</div>` : ''}
    </div></div></div>`;

const segno = (n) => (Number(n) > 0 ? 'text-success' : Number(n) < 0 ? 'text-danger' : '');
const conSegno = (n, testo) => `${Number(n) > 0 ? '+' : ''}${testo}`;

function renderKpi() {
    let total = 0, units = 0;
    for (const c of contributions) {
        total += Number(c.amount) || 0;
        units += Number(c.units)  || 0;
    }

    // Finche' l'andamento non e' arrivato (o non e' calcolabile) si mostra
    // quello che si sa con certezza: quanto e' stato versato.
    const p = andamentoDati;
    const valore = p?.valore ?? null;

    kpiEl.innerHTML = [
        kpi('Versato totale', escapeHtml(fmtMoney(total)), `${contributions.length} versamenti`),
        kpi(
            'Valore oggi',
            valore === null ? '<span class="text-muted">—</span>' : escapeHtml(fmtMoney(valore)),
            valore === null ? 'serve un NAV del fondo' : `col NAV del ${escapeHtml(p.nav_al ?? p.valore_al)}`,
        ),
        kpi(
            'Guadagno',
            p?.guadagno === null || p?.guadagno === undefined
                ? '<span class="text-muted">—</span>'
                : escapeHtml(conSegno(p.guadagno, fmtMoney(p.guadagno))),
            p?.guadagno_pct === null || p?.guadagno_pct === undefined
                ? '' : `${escapeHtml(conSegno(p.guadagno_pct, `${fmtNum(p.guadagno_pct, 2)}%`))} sul versato`,
            segno(p?.guadagno),
        ),
        kpi(
            'Rendimento annuo',
            p?.tir === null || p?.tir === undefined
                ? '<span class="text-muted">—</span>'
                : escapeHtml(conSegno(p.tir, `${fmtNum(p.tir, 2)}%`)),
            'tiene conto di quando hai versato',
            segno(p?.tir),
        ),
    ].join('');
}

// ── Quotazioni da Internet ───────────────────────────────────────────────────

const navFetchBtn = document.getElementById('nav-fetch-btn');

navFetchBtn?.addEventListener('click', async () => {
    const testo = navFetchBtn.innerHTML;
    navFetchBtn.disabled = true;
    navFetchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Scarico…';
    try {
        const r = await send(`${BASE}/pac/funds/nav-fetch`, { fund_id: navFetchBtn.dataset.fundId });
        const d = r?.data ?? {};
        const versamenti = d.valorizzati > 0 ? ` ${d.valorizzati} versamenti hanno ora le loro quote.` : '';
        toast.success((d.salvati > 0
            ? `${d.salvati} quotazioni nuove da ${d.symbol} (${d.dal} → ${d.al}).`
            : `Nessuna quotazione nuova: ${d.symbol} era già aggiornato.`) + versamenti);
        await Promise.all([loadContributions(), loadNavHistory(), loadAndamento()]);
    } catch (err) {
        toast.error(err.message ?? 'Non sono riuscito a scaricare le quotazioni.');
    } finally {
        navFetchBtn.disabled = false;
        navFetchBtn.innerHTML = testo;
    }
});

// ── Andamento ────────────────────────────────────────────────────────────────

let andamentoDati = null;
let andamentoChart = null;

async function loadAndamento() {
    const r = await apiGuard(api.get(`${BASE}/pac/plans/performance`, { plan_id: PLAN.id }));
    andamentoDati = r.data ?? null;
    renderKpi();
    renderAndamento();
}

function renderAndamento() {
    const canvas = document.getElementById('plan-chart');
    const nota   = document.getElementById('plan-chart-note');
    if (!canvas || typeof Chart === 'undefined') return;

    const serie = andamentoDati?.serie ?? [];
    if (andamentoChart) andamentoChart.destroy();

    if (serie.length === 0) {
        if (nota) nota.textContent = 'nessun versamento da mostrare';
        return;
    }
    const conValore = serie.filter(p => p.valore !== null).length;
    if (nota) {
        nota.textContent = conValore === 0
            ? 'manca il NAV del fondo: si vede solo quanto hai versato'
            : `${serie.length} punti, dal ${serie[0].date}`;
    }

    andamentoChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: serie.map(p => p.date),
            datasets: [
                {
                    label: 'Valore',
                    data: serie.map(p => p.valore),
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25,135,84,.12)',
                    fill: true,
                    tension: 0.25,
                    // Un buco nella linea dice «qui il NAV non c'era», che e'
                    // un'informazione: unire i punti la nasconderebbe.
                    spanGaps: false,
                },
                {
                    label: 'Versato',
                    data: serie.map(p => p.versato),
                    borderColor: '#6c757d',
                    borderDash: [5, 4],
                    pointRadius: 0,
                    tension: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y === null ? '—' : fmtMoney(ctx.parsed.y)}`,
                    },
                },
            },
            scales: {
                y: { ticks: { callback: (v) => fmtMoney(v) } },
                x: { ticks: { maxTicksLimit: 8 } },
            },
        },
    });
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
        await Promise.all([loadContributions(), loadNavHistory(), loadAndamento()]);
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
        await Promise.all([loadContributions(), loadNavHistory(), loadAndamento()]);
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
    await Promise.all([loadContributions(), loadNavHistory(), loadAndamento()]);
})();
