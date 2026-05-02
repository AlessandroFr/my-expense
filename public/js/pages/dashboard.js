// ─── pages/dashboard.js ──────────────────────────────────────────────────────
// Carica /dashboard/data, aggiorna KPI, render Chart.js (doughnut + bar).

import FetchRequest                from '../FetchRequest.js';
import { apiGuard, escapeHtml }    from '../componentBase.js';
import { toast }                   from '../toast.js';
import { tweenNumber, stagger } from '../transitions.js';

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

function tweenMoney(el, to) {
    if (!el) return;
    const from = parseFloat((el.dataset.value ?? '').replace(/[^\d.-]/g, '')) || 0;
    el.classList.add('mx-num');
    tweenNumber(el, from, to, { format: fmtMoney });
    el.dataset.value = String(to);
}

function renderKpi(d) {
    tweenMoney(document.getElementById('kpi-current'), Number(d.totals.current ?? 0));
    tweenMoney(document.getElementById('kpi-income'),  Number(d.totals.income_current ?? 0));
    document.getElementById('kpi-current-month').textContent = fmtMonthLong(d.current_month);

    const netEl  = document.getElementById('kpi-net');
    const netVal = Number(d.totals.net_current ?? 0);
    tweenMoney(netEl, netVal);
    netEl.className = 'mx-num h3 fw-semibold mt-1 ' +
        (netVal > 0 ? 'text-success' : (netVal < 0 ? 'text-danger' : 'text-muted'));

    const deltaEl = document.getElementById('kpi-delta');
    deltaEl.classList.add('mx-num');
    if (d.totals.delta_pct === null) {
        deltaEl.textContent = '-';
        deltaEl.className   = 'mx-num h3 fw-semibold mt-1 text-muted';
    } else {
        const fromPct = parseFloat(deltaEl.dataset.value ?? '0') || 0;
        const toPct   = Number(d.totals.delta_pct);
        const sign    = (n) => (n > 0 ? '+' : '') + n.toFixed(1) + '%';
        tweenNumber(deltaEl, fromPct, toPct, { format: sign });
        deltaEl.dataset.value = String(toPct);
        deltaEl.className = 'mx-num h3 fw-semibold mt-1 ' +
            (toPct > 0 ? 'text-danger'
                : (toPct < 0 ? 'text-success' : 'text-muted'));
    }
}

function renderBudgetProgress(items) {
    const card = document.getElementById('budget-card');
    const box  = document.getElementById('budget-progress');
    if (!items || !items.length) {
        card.classList.add('d-none');
        return;
    }
    card.classList.remove('d-none');
    box.innerHTML = items.map(b => {
        const pct      = Math.min(b.progress_pct, 100);
        const overFlag = b.progress_pct > 100;
        const cls      = b.progress_pct >= 100 ? 'bg-danger'
                       : (b.progress_pct >= 80 ? 'bg-warning' : 'bg-success');
        return `
        <div class="col-md-6 col-lg-4">
            <div class="d-flex justify-content-between small mb-1">
                <span><span class="badge me-1" style="background:${escapeHtml(b.color)}">&nbsp;</span>${escapeHtml(b.name)}</span>
                <span class="${overFlag ? 'text-danger fw-semibold' : 'text-muted'}">
                    ${fmtMoney(b.spent)} / ${fmtMoney(b.amount)}
                </span>
            </div>
            <div class="progress" style="height:8px">
                <div class="progress-bar ${cls}" style="width:${pct}%"></div>
            </div>
        </div>`;
    }).join('');
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

function renderByMonth(expenses, incomes) {
    const canvas = document.getElementById('chart-by-month');
    // Unifica i mesi presenti in entrambi i dataset.
    const months = Array.from(new Set([
        ...expenses.map(m => m.month),
        ...incomes.map(m => m.month),
    ])).sort();
    const expMap = new Map(expenses.map(m => [m.month, Number(m.total)]));
    const incMap = new Map(incomes.map(m => [m.month, Number(m.total)]));

    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: months.map(fmtMonthShort),
            datasets: [
                {
                    label: 'Spese',
                    data:  months.map(m => expMap.get(m) ?? 0),
                    backgroundColor: '#dc3545',
                    borderRadius: 4,
                },
                {
                    label: 'Entrate',
                    data:  months.map(m => incMap.get(m) ?? 0),
                    backgroundColor: '#198754',
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`,
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
        renderBudgetProgress(d.budget_progress ?? []);
        renderByCategory(d.by_category ?? []);
        renderByMonth(d.by_month ?? [], d.income_by_month ?? []);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento dashboard.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.row.g-3.mb-4').forEach(row => stagger(row));
    loadData();
});
