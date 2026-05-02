// ─── pages/dashboard.js ──────────────────────────────────────────────────────
// Carica /dashboard/data, aggiorna KPI, render Chart.js (doughnut + bar).

import FetchRequest    from '../FetchRequest.js';
import { apiGuard }    from '../componentBase.js';
import { toast }       from '../toast.js';

const api  = FetchRequest.getInstance();
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const monthFmt      = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' });

function fmtMoney(n) { return moneyFmt.format(Number(n) || 0); }

function fmtMonthLong(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    return monthFmt.format(new Date(y, (m || 1) - 1, 1));
}

function fmtMonthShort(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    return monthShortFmt.format(new Date(y, (m || 1) - 1, 1));
}

function renderKpi(d) {
    document.getElementById('kpi-current').textContent       = fmtMoney(d.totals.current);
    document.getElementById('kpi-previous').textContent      = fmtMoney(d.totals.previous);
    document.getElementById('kpi-current-month').textContent = fmtMonthLong(d.current_month);

    const deltaEl = document.getElementById('kpi-delta');
    if (d.totals.delta_pct === null) {
        deltaEl.textContent = '—';
        deltaEl.className   = 'display-6 fw-semibold mt-1 text-muted';
    } else {
        const sign = d.totals.delta_pct > 0 ? '+' : '';
        deltaEl.textContent = `${sign}${d.totals.delta_pct.toFixed(1)}%`;
        // Rosso se sale (spendi di più), verde se scende.
        deltaEl.className = 'display-6 fw-semibold mt-1 ' +
            (d.totals.delta_pct > 0 ? 'text-danger'
                : (d.totals.delta_pct < 0 ? 'text-success' : 'text-muted'));
    }
}

function renderByCategory(data) {
    const canvas = document.getElementById('chart-by-category');
    const empty  = document.getElementById('by-category-empty');
    if (!data.length) {
        canvas.classList.add('d-none');
        empty.classList.remove('d-none');
        return;
    }
    canvas.classList.remove('d-none');
    empty.classList.add('d-none');

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: data.map(c => c.name),
            datasets: [{
                data:            data.map(c => Number(c.total)),
                backgroundColor: data.map(c => c.color),
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12 } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${fmtMoney(ctx.parsed)}`,
                    },
                },
            },
        },
    });
}

function renderByMonth(data) {
    const canvas = document.getElementById('chart-by-month');
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: data.map(m => fmtMonthShort(m.month)),
            datasets: [{
                label: 'Totale',
                data:           data.map(m => Number(m.total)),
                backgroundColor: '#0d6efd',
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => fmtMoney(ctx.parsed.y),
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (v) => fmtMoney(v).replace(',00', '') },
                },
            },
        },
    });
}

async function loadData() {
    try {
        const r = await apiGuard(api.get(`${BASE}/dashboard/data`));
        const d = r.data ?? {};
        renderKpi(d);
        renderByCategory(d.by_category ?? []);
        renderByMonth(d.by_month ?? []);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento dashboard.');
    }
}

document.addEventListener('DOMContentLoaded', loadData);
