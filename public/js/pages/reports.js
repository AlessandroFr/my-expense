// ─── pages/reports.js ────────────────────────────────────────────────────────
// Report annuale: KPI + chart trend mensile + chart categorie + heatmap + top 10.

import FetchRequest          from '../FetchRequest.js';
import { apiGuard, escapeAttr, escapeHtml } from '../componentBase.js';
import { toast }             from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip, tweenNumber } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';
import { fmtDate, fmtMoney } from '../format.js';

const api  = FetchRequest.getInstance();
const BASE = document.body.dataset.baseUrl ?? '';


const MONTH_LABELS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

const yearSel = document.getElementById('report-year');
let trendChart = null;
let catChart   = null;
let suppliersChart = null;
let customersChart = null;
let assetClassChart = null;
let dividendsChart  = null;

function tweenMoneyR(el, to) {
    if (!el) return;
    const from = parseFloat((el.dataset.value ?? '').replace(/[^\d.-]/g, '')) || 0;
    el.classList.add('mx-num');
    tweenNumber(el, from, to, { format: fmtMoney });
    el.dataset.value = String(to);
}

function setKpi(d) {
    tweenMoneyR(document.getElementById('r-total-exp'), Number(d.total_expenses ?? 0));
    tweenMoneyR(document.getElementById('r-total-inc'), Number(d.total_incomes ?? 0));
    const netEl = document.getElementById('r-net');
    tweenMoneyR(netEl, Number(d.net ?? 0));
    netEl.className   = 'h3 fw-semibold mt-1 ' +
        (d.net > 0 ? 'text-success' : (d.net < 0 ? 'text-danger' : 'text-muted'));
    tweenMoneyR(document.getElementById('r-avg'), Number(d.monthly_avg ?? 0));
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
            return `<td style="${bg}" title="${escapeAttr(row.name)}: ${fmtMoney(v)}"><small>${fmtMoney(v).replace(',00','').replace('€','').replace('EUR','').trim()}</small></td>`;
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
            <td>${escapeHtml(fmtDate(e.expense_date))}</td>
            <td><span class="badge" style="background:${escapeHtml(e.category_color)}">${escapeHtml(e.category_name)}</span></td>
            <td>${e.description ? escapeHtml(e.description) : '<span class="text-muted">-</span>'}</td>
            <td class="text-end fw-semibold">${fmtMoney(e.amount)}</td>
        </tr>
    `).join('');
}

function renderContactBalance(rows) {
    const tbody = document.getElementById('contact-balance-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Nessuna anagrafica con movimenti nel periodo.</td></tr>';
    } else {
        const top = rows.slice(0, 15);
        const baseUrl = BASE;
        tbody.innerHTML = top.map(r => {
            const netClass = r.net > 0 ? 'text-success' : (r.net < 0 ? 'text-danger' : 'text-muted');
            return `
                <tr>
                    <td>
                        <span class="d-inline-block rounded-circle me-1" style="width:.6rem;height:.6rem;background:${escapeHtml(r.color)}"></span>
                        <a href="${baseUrl}/contacts/detail?id=${r.contact_id}&year=${yearSel.value}" class="text-decoration-none">${escapeHtml(r.name)}</a>
                    </td>
                    <td class="text-end text-danger">${r.expenses_total ? fmtMoney(r.expenses_total) : '<span class="text-muted">—</span>'}</td>
                    <td class="text-end text-success">${r.incomes_total ? fmtMoney(r.incomes_total) : '<span class="text-muted">—</span>'}</td>
                    <td class="text-end ${netClass}">${fmtMoney(r.net)}</td>
                </tr>`;
        }).join('');
    }

    // Top fornitori per spesa
    const suppliers = (rows || []).filter(r => r.expenses_total > 0)
        .sort((a, b) => b.expenses_total - a.expenses_total).slice(0, 10);
    if (suppliersChart) suppliersChart.destroy();
    const suppCtx = document.getElementById('chart-top-suppliers');
    if (suppCtx) {
        suppliersChart = new Chart(suppCtx, {
            type: 'doughnut',
            data: {
                labels: suppliers.map(r => r.name),
                datasets: [{ data: suppliers.map(r => r.expenses_total), backgroundColor: suppliers.map(r => r.color), borderWidth: 1 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });
    }

    // Top clienti per entrata
    const customers = (rows || []).filter(r => r.incomes_total > 0)
        .sort((a, b) => b.incomes_total - a.incomes_total).slice(0, 10);
    if (customersChart) customersChart.destroy();
    const custCtx = document.getElementById('chart-top-customers');
    if (custCtx) {
        customersChart = new Chart(custCtx, {
            type: 'doughnut',
            data: {
                labels: customers.map(r => r.name),
                datasets: [{ data: customers.map(r => r.incomes_total), backgroundColor: customers.map(r => r.color), borderWidth: 1 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });
    }
}

function renderInvestments(inv) {
    const section = document.getElementById('r-investments-section');
    if (!section) return;
    if (!inv || !inv.has_data) {
        section.classList.add('d-none');
        return;
    }
    section.classList.remove('d-none');

    document.getElementById('r-inv-invested').textContent = fmtMoney(inv.total_invested);
    document.getElementById('r-inv-current').textContent  = inv.total_current !== null
        ? fmtMoney(inv.total_current) : '—';
    const pnlEl = document.getElementById('r-inv-pnl');
    if (inv.total_pnl !== null) {
        pnlEl.textContent = fmtMoney(inv.total_pnl);
        pnlEl.className   = 'h4 fw-semibold mt-1 ' +
            (inv.total_pnl > 0 ? 'text-success' : (inv.total_pnl < 0 ? 'text-danger' : 'text-muted'));
    } else {
        pnlEl.textContent = '—';
        pnlEl.className   = 'h4 fw-semibold mt-1 text-muted';
    }
    document.getElementById('r-inv-divyear').textContent = fmtMoney(inv.total_dividends_year || 0);

    // Doughnut asset class
    if (assetClassChart) assetClassChart.destroy();
    const acCtx = document.getElementById('chart-asset-classes');
    if (acCtx && (inv.by_asset_class ?? []).length) {
        const labels = inv.by_asset_class.map(c => c.asset_class_name);
        const data   = inv.by_asset_class.map(c => Number(c.invested) || 0);
        const colors = inv.by_asset_class.map(c => c.asset_class_color || '#6c757d');
        assetClassChart = new Chart(acCtx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } },
            },
        });
    }

    // Bar dividendi mensili
    if (dividendsChart) dividendsChart.destroy();
    const divCtx = document.getElementById('chart-dividends');
    if (divCtx) {
        dividendsChart = new Chart(divCtx, {
            type: 'bar',
            data: {
                labels: MONTH_LABELS,
                datasets: [{
                    label: 'Dividendi',
                    data: inv.dividends_by_month ?? Array(12).fill(0),
                    backgroundColor: 'rgba(25,135,84,0.7)',
                    borderColor: 'rgba(25,135,84,1)',
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } },
            },
        });
    }

    // Tabella per asset class
    const tbody = document.getElementById('r-inv-by-class');
    if (tbody) {
        const rows = (inv.by_asset_class ?? []).map(c => {
            const pnlCls = c.pnl !== null
                ? (c.pnl > 0 ? 'text-success' : (c.pnl < 0 ? 'text-danger' : 'text-muted'))
                : 'text-muted';
            return `
                <tr>
                    <td><span class="badge me-1" style="background:${c.asset_class_color}">&nbsp;</span>${escapeHtml(c.asset_class_name)}</td>
                    <td class="text-end">${escapeHtml(fmtMoney(c.invested))}</td>
                    <td class="text-end">${c.current !== null ? escapeHtml(fmtMoney(c.current)) : '—'}</td>
                    <td class="text-end ${pnlCls}">${c.pnl !== null ? escapeHtml(fmtMoney(c.pnl)) : '—'}</td>
                    <td class="text-end">${escapeHtml(fmtMoney(c.dividends || 0))}</td>
                </tr>`;
        }).join('');
        tbody.innerHTML = rows || '<tr><td colspan="5" class="text-center text-muted">—</td></tr>';
    }
}

async function load() {
    try {
        const [r, balResp] = await Promise.all([
            apiGuard(api.get(`${BASE}/reports/year`, { year: yearSel.value })),
            api.get(`${BASE}/contacts/balance?year=${yearSel.value}`).catch(() => ({ data: { summary: [] } })),
        ]);
        const d = r.data ?? {};
        setKpi(d);
        renderTrend(d.by_month ?? []);
        renderCategories(d.by_category ?? []);
        renderHeatmap(d.heatmap ?? { matrix: [] });
        renderTopExpenses(d.top_expenses ?? []);
        renderContactBalance(balResp?.data?.summary ?? []);
        renderInvestments(d.investments ?? null);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento report.');
    }
}

yearSel.addEventListener('change', load);
document.addEventListener('DOMContentLoaded', load);
