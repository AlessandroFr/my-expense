// ─── pages/contact_detail.js ─────────────────────────────────────────────────
// Dettaglio singola anagrafica: KPI periodo, doughnut categorie, lista movimenti.

import FetchRequest from '../FetchRequest.js';
import { toast }     from '../toast.js';

const api = FetchRequest.getInstance();
const BASE = document.body.dataset.baseUrl ?? '';

const ctx = window.MX_CONTACT ?? { id: 0, year: new Date().getFullYear() };

const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
function fmtAmount(v) { return fmt.format(Number(v) || 0); }
function escHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

let breakdownChart = null;

async function load(year) {
    const from = `${year}-01-01`;
    const to   = `${year}-12-31`;
    try {
        const [balResp, expResp, incResp] = await Promise.all([
            api.get(`${BASE}/contacts/balance?contact_id=${ctx.id}&year=${year}`),
            api.get(`${BASE}/expenses/list?contact_id=${ctx.id}&date_from=${from}&date_to=${to}&limit=500`),
            api.get(`${BASE}/incomes/list?contact_id=${ctx.id}&date_from=${from}&date_to=${to}&limit=500`),
        ]);

        const totals = balResp?.data?.totals ?? null;
        renderKpis(totals);
        renderBreakdown(balResp?.data?.breakdown ?? []);

        const expenses = (expResp?.data?.expenses ?? []).map(r => ({ ...r, _kind: 'expense', _date: r.expense_date }));
        const incomes  = (incResp?.data?.incomes  ?? []).map(r => ({ ...r, _kind: 'income',  _date: r.income_date  }));
        const merged = [...expenses, ...incomes].sort((a, b) => (b._date || '').localeCompare(a._date || ''));
        renderMovements(merged);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento dati.');
    }
}

function renderKpis(totals) {
    const exp = totals ? Number(totals.expenses_total) : 0;
    const inc = totals ? Number(totals.incomes_total)  : 0;
    const net = totals ? Number(totals.net) : 0;
    document.getElementById('kpi-expenses').textContent = fmtAmount(exp);
    document.getElementById('kpi-incomes').textContent  = fmtAmount(inc);
    const netEl = document.getElementById('kpi-net');
    netEl.textContent = fmtAmount(net);
    netEl.classList.remove('text-success', 'text-danger', 'text-muted');
    netEl.classList.add(net > 0 ? 'text-success' : (net < 0 ? 'text-danger' : 'text-muted'));
    document.getElementById('kpi-expenses-count').textContent = totals
        ? `${totals.expenses_count} operazioni` : '—';
    document.getElementById('kpi-incomes-count').textContent  = totals
        ? `${totals.incomes_count} operazioni`  : '—';
}

function renderBreakdown(rows) {
    const el = document.getElementById('chart-breakdown');
    if (!el || typeof Chart === 'undefined') return;
    if (breakdownChart) { breakdownChart.destroy(); breakdownChart = null; }

    if (rows.length === 0) {
        el.parentElement.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-emoji-smile fs-3 d-block mb-2"></i>Nessuna spesa nel periodo.</div>';
        return;
    }

    const labels = rows.map(r => r.category_name);
    const data   = rows.map(r => Number(r.total));
    const colors = rows.map(r => r.category_color);

    breakdownChart = new Chart(el, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } },
        },
    });
}

function renderMovements(rows) {
    const tbody = document.getElementById('movements-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nessun movimento nel periodo.</td></tr>';
        return;
    }
    for (const r of rows) {
        const tr = document.createElement('tr');
        const isExpense = r._kind === 'expense';
        const cls = isExpense ? 'text-danger' : 'text-success';
        const sign = isExpense ? '−' : '+';
        const cat  = r.category_name ?? r.source ?? '—';
        const catColor = r.category_color ?? '#6c757d';
        tr.innerHTML = `
            <td class="text-nowrap">${escHtml(r._date)}</td>
            <td><span class="badge ${isExpense ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}">${isExpense ? 'Spesa' : 'Entrata'}</span></td>
            <td>
                <span class="d-inline-block rounded-circle me-1" style="width:.6rem;height:.6rem;background-color:${escHtml(catColor)}"></span>
                ${escHtml(cat)}
            </td>
            <td class="text-truncate" style="max-width:340px">${escHtml(r.description ?? '')}</td>
            <td class="text-end ${cls}">${sign} ${fmtAmount(r.amount)}</td>
        `;
        tbody.appendChild(tr);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    load(ctx.year);
    document.getElementById('year-picker')?.addEventListener('change', (ev) => {
        const y = Number(ev.target.value);
        const url = new URL(window.location.href);
        url.searchParams.set('year', String(y));
        window.location.href = url.toString();
    });
});
