// ─── pages/reports.js ────────────────────────────────────────────────────────
// Report annuale: KPI + chart trend mensile + chart categorie + heatmap + top 10.

import FetchRequest          from '../FetchRequest.js';
import { apiGuard, escapeHtml } from '../componentBase.js';
import { toast }             from '../toast.js';

const api  = FetchRequest.getInstance();
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);
const MONTH_LABELS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

const yearSel = document.getElementById('report-year');
let trendChart = null;
let catChart   = null;

function setKpi(d) {
    document.getElementById('r-total-exp').textContent = fmtMoney(d.total_expenses);
    document.getElementById('r-total-inc').textContent = fmtMoney(d.total_incomes);
    const netEl = document.getElementById('r-net');
    netEl.textContent = fmtMoney(d.net);
    netEl.className   = 'h3 fw-semibold mt-1 ' +
        (d.net > 0 ? 'text-success' : (d.net < 0 ? 'text-danger' : 'text-muted'));
    document.getElementById('r-avg').textContent = fmtMoney(d.monthly_avg);
    const extr = [];
    if (d.max_month) extr.push(`max ${MONTH_LABELS[parseInt(d.max_month.month.slice(5,7))-1]} (${fmtMoney(d.max_month.expenses)})`);
    if (d.min_month && d.min_month.month !== d.max_month?.month) {
        extr.push(`min ${MONTH_LABELS[parseInt(d.min_month.month.slice(5,7))-1]} (${fmtMoney(d.min_month.expenses)})`);
    }
    document.getElementById('r-extremes').textContent = extr.join(' / ');
    document.getElementById('report-year-label').textContent = d.year;
}

function renderTrend(byMonth) {
    if (trendChart) trendChart.destroy();
    const ctx = document.getElementById('chart-yearly-trend');
    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTH_LABELS,
            datasets: [
                { label: 'Spese',   data: byMonth.map(m => m.expenses), backgroundColor: '#dc3545', borderRadius: 4, order: 2 },
                { label: 'Entrate', data: byMonth.map(m => m.incomes),  backgroundColor: '#198754', borderRadius: 4, order: 2 },
                { label: 'Bilancio', type: 'line', data: byMonth.map(m => m.net), borderColor: '#0d6efd', backgroundColor: '#0d6efd', tension: 0.3, order: 1 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}` } },
            },
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtMoney(v).replace(',00','') } } },
        },
    });
}

function renderCategories(byCategory) {
    if (catChart) catChart.destroy();
    const ctx = document.getElementById('chart-yearly-cats');
    if (!byCategory.length) {
        ctx.parentElement.innerHTML = '<div class="text-center text-muted py-4">Nessuna spesa nell\'anno selezionato.</div>';
        return;
    }
    catChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: byCategory.map(c => c.name),
            datasets: [{
                data:            byCategory.map(c => c.total),
                backgroundColor: byCategory.map(c => c.color),
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
                        label: (ctx) => {
                            const c = byCategory[ctx.dataIndex];
                            return `${c.name}: ${fmtMoney(c.total)} (${c.pct}%)`;
                        },
                    },
                },
            },
        },
    });
}

function renderHeatmap(heatmap) {
    const thead = document.querySelector('#heatmap-table thead');
    const tbody = document.querySelector('#heatmap-table tbody');
    if (!heatmap.matrix || !heatmap.matrix.length) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td class="text-muted py-3">Nessuna spesa.</td></tr>';
        return;
    }
    thead.innerHTML = `<tr>
        <th class="text-start">Categoria</th>
        ${MONTH_LABELS.map(l => `<th>${l}</th>`).join('')}
    </tr>`;

    let maxVal = 0;
    heatmap.matrix.forEach(row => row.months.forEach(v => { if (v > maxVal) maxVal = v; }));

    tbody.innerHTML = heatmap.matrix.map(row => {
        const cells = row.months.map(v => {
            if (v <= 0) return `<td class="text-muted">.</td>`;
            const pct   = maxVal > 0 ? v / maxVal : 0;
            const alpha = 0.15 + 0.85 * pct;
            const bg    = `background:${row.color}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`;
            return `<td style="${bg}" title="${escapeHtml(row.name)}: ${fmtMoney(v)}"><small>${fmtMoney(v).replace(',00','').replace('€','').replace('EUR','').trim()}</small></td>`;
        }).join('');
        return `<tr>
            <td class="text-start"><span class="badge me-1" style="background:${escapeHtml(row.color)}">&nbsp;</span>${escapeHtml(row.name)}</td>
            ${cells}
        </tr>`;
    }).join('');
}

function renderTopExpenses(items) {
    const tbody = document.getElementById('top-expenses-tbody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Nessuna spesa.</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(e => `
        <tr>
            <td>${escapeHtml(e.expense_date)}</td>
            <td><span class="badge" style="background:${escapeHtml(e.category_color)}">${escapeHtml(e.category_name)}</span></td>
            <td>${e.description ? escapeHtml(e.description) : '<span class="text-muted">-</span>'}</td>
            <td class="text-end fw-semibold">${fmtMoney(e.amount)}</td>
        </tr>
    `).join('');
}

async function load() {
    try {
        const r = await apiGuard(api.get(`${BASE}/reports/year`, { year: yearSel.value }));
        const d = r.data ?? {};
        setKpi(d);
        renderTrend(d.by_month ?? []);
        renderCategories(d.by_category ?? []);
        renderHeatmap(d.heatmap ?? { matrix: [] });
        renderTopExpenses(d.top_expenses ?? []);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento report.');
    }
}

yearSel.addEventListener('change', load);
document.addEventListener('DOMContentLoaded', load);
