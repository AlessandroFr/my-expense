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
const dateFmt       = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

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

function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

// ── Range presets ──────────────────────────────────────────────────────────

function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function computeRangeFromPreset(preset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let from, to;
    switch (preset) {
        case 'last_month': {
            from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            to   = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        }
        case 'this_quarter': {
            const q = Math.floor(today.getMonth() / 3);
            from = new Date(today.getFullYear(), q * 3, 1);
            to   = new Date(today.getFullYear(), q * 3 + 3, 0);
            break;
        }
        case 'this_year':
            from = new Date(today.getFullYear(), 0, 1);
            to   = new Date(today.getFullYear(), 11, 31);
            break;
        case 'last_30':
            to = new Date(today);
            from = new Date(today); from.setDate(from.getDate() - 29);
            break;
        case 'last_90':
            to = new Date(today);
            from = new Date(today); from.setDate(from.getDate() - 89);
            break;
        case 'last_12m':
            to = new Date(today);
            from = new Date(today); from.setMonth(from.getMonth() - 11); from.setDate(1);
            break;
        case 'this_month':
        default:
            from = new Date(today.getFullYear(), today.getMonth(), 1);
            to   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
    }
    return { from: isoDate(from), to: isoDate(to) };
}

function periodLabel(range) {
    if (!range) return '';
    const { from, to } = range;
    const f = new Date(from + 'T00:00:00');
    const t = new Date(to   + 'T00:00:00');
    // Range = mese pieno → "Maggio 2026"
    if (f.getDate() === 1
        && f.getFullYear() === t.getFullYear()
        && f.getMonth() === t.getMonth()
        && t.getDate() === new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
    ) {
        return monthFmt.format(f);
    }
    // Range = anno pieno → "Anno 2026"
    if (f.getDate() === 1 && f.getMonth() === 0 && t.getMonth() === 11 && t.getDate() === 31) {
        return `Anno ${f.getFullYear()}`;
    }
    return `${fmtDate(from)} → ${fmtDate(to)}`;
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

    const label = periodLabel(d.range);
    document.querySelectorAll('[data-period-label]').forEach(el => el.textContent = label);

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

let categoryChart = null;
let monthChart    = null;

function renderByCategory(data) {
    const canvas = document.getElementById('chart-by-category');
    const empty  = document.getElementById('by-category-empty');
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    if (!data.length) {
        canvas.classList.add('d-none');
        empty.classList.remove('d-none');
        return;
    }
    canvas.classList.remove('d-none');
    empty.classList.add('d-none');

    categoryChart = new Chart(canvas, {
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
    if (monthChart) { monthChart.destroy(); monthChart = null; }
    // Unifica i mesi presenti in entrambi i dataset.
    const months = Array.from(new Set([
        ...expenses.map(m => m.month),
        ...incomes.map(m => m.month),
    ])).sort();
    const expMap = new Map(expenses.map(m => [m.month, Number(m.total)]));
    const incMap = new Map(incomes.map(m => [m.month, Number(m.total)]));

    monthChart = new Chart(canvas, {
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

function renderInvestmentsWidget(inv) {
    const card = document.getElementById('investments-card');
    if (!card) return;
    if (!inv || !inv.has_data) {
        card.classList.add('d-none');
        return;
    }
    card.classList.remove('d-none');

    const investedEl = document.getElementById('inv-invested');
    const currentEl  = document.getElementById('inv-current');
    const pnlEl      = document.getElementById('inv-pnl');
    if (investedEl) investedEl.textContent = fmtMoney(inv.total_invested);
    if (currentEl)  currentEl.textContent  = inv.total_current !== null ? fmtMoney(inv.total_current) : '—';
    if (pnlEl) {
        if (inv.total_pnl !== null) {
            pnlEl.textContent = fmtMoney(inv.total_pnl);
            pnlEl.className   = 'h4 fw-semibold mt-1 ' +
                (inv.total_pnl > 0 ? 'text-success' : (inv.total_pnl < 0 ? 'text-danger' : 'text-muted'));
        } else {
            pnlEl.textContent = '—';
            pnlEl.className   = 'h4 fw-semibold mt-1 text-muted';
        }
    }

    const barsEl = document.getElementById('inv-asset-bars');
    if (barsEl) {
        const list = inv.by_asset_class ?? [];
        const total = list.reduce((s, c) => s + (Number(c.invested) || 0), 0);
        if (total <= 0 || !list.length) {
            barsEl.innerHTML = '';
            return;
        }
        barsEl.innerHTML = `
            <div class="text-muted small mb-1">Allocazione per asset class</div>
            <div class="progress" style="height:18px">
                ${list.map(c => {
                    const w = total > 0 ? ((Number(c.invested) || 0) / total) * 100 : 0;
                    return `<div class="progress-bar" role="progressbar"
                                 style="width:${w.toFixed(1)}%; background:${c.asset_class_color || '#6c757d'}"
                                 title="${c.asset_class_name}: ${fmtMoney(c.invested)}">
                              ${w >= 8 ? `${w.toFixed(0)}%` : ''}
                            </div>`;
                }).join('')}
            </div>
            <div class="d-flex flex-wrap gap-2 mt-2">
                ${list.map(c => `
                    <span class="small">
                        <span class="badge me-1" style="background:${c.asset_class_color || '#6c757d'}">&nbsp;</span>
                        ${c.asset_class_name}
                    </span>`).join('')}
            </div>`;
    }
}

async function loadData(range = null) {
    try {
        const params = range ? { from: range.from, to: range.to } : {};
        const r = await apiGuard(api.get(`${BASE}/dashboard/data`, params));
        const d = r.data ?? {};
        renderKpi(d);
        renderBudgetProgress(d.budget_progress ?? []);
        renderByCategory(d.by_category ?? []);
        renderByMonth(d.by_month ?? [], d.income_by_month ?? []);
        renderInvestmentsWidget(d.investments ?? null);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento dashboard.');
    }
}

// ── Filtro periodo ─────────────────────────────────────────────────────────

function getCurrentRange() {
    const fromEl = document.getElementById('dash-from');
    const toEl   = document.getElementById('dash-to');
    if (fromEl?.value && toEl?.value && fromEl.value <= toEl.value) {
        return { from: fromEl.value, to: toEl.value };
    }
    return computeRangeFromPreset('this_month');
}

function applyPresetToInputs(preset) {
    const range = computeRangeFromPreset(preset);
    const fromEl = document.getElementById('dash-from');
    const toEl   = document.getElementById('dash-to');
    if (fromEl) fromEl.value = range.from;
    if (toEl)   toEl.value   = range.to;
    return range;
}

function wireFilter() {
    const presetEl = document.getElementById('dash-preset');
    const fromEl   = document.getElementById('dash-from');
    const toEl     = document.getElementById('dash-to');
    const applyBtn = document.getElementById('dash-apply');
    if (!presetEl || !applyBtn) return;

    // Init: imposta range dal preset di default.
    const initial = applyPresetToInputs(presetEl.value);

    presetEl.addEventListener('change', () => {
        if (presetEl.value === 'custom') return; // l'utente edita le date a mano
        const range = applyPresetToInputs(presetEl.value);
        loadData(range);
    });

    // Edit manuale delle date → preset diventa "custom".
    [fromEl, toEl].forEach(el => el?.addEventListener('change', () => {
        presetEl.value = 'custom';
    }));

    applyBtn.addEventListener('click', () => {
        loadData(getCurrentRange());
    });

    return initial;
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.row.g-3.mb-4').forEach(row => stagger(row));
    const initial = wireFilter();
    loadData(initial);
});
