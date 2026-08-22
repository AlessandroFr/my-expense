// ─── pages/pac.js ────────────────────────────────────────────────────────────
// Piano di Accumulo Capitale: lista piani + form fondi + form piano + KPI.

import FetchRequest                                       from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog }                                  from '../componentBase.js';
import { toast }                                          from '../toast.js';
import { fmtMoney } from '../format.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';


const FREQ_LABEL = {
    weekly: 'Settimanale', monthly: 'Mensile',
    quarterly: 'Trimestrale', yearly: 'Annuale',
};

const planForm   = document.getElementById('plan-create-form');
const fundForm   = document.getElementById('fund-create-form');
const fundModal  = document.getElementById('fund-create-modal');
const changeForm  = document.getElementById('fund-change-form');
const changeModal = document.getElementById('fund-change-modal');
const listEl     = document.getElementById('pac-plans-list');
const kpiEl      = document.getElementById('pac-kpi');

let pacAccounts    = [];
let sourceAccounts = [];
let funds          = [];
let plans          = [];

async function loadAccounts() {
    const r = await apiGuard(api.get(`${BASE}/accounts/list`, { include_archived: 0 }));
    const all = r.data?.accounts ?? [];
    pacAccounts    = all.filter(a => a.type === 'pac');
    sourceAccounts = all.filter(a => a.type !== 'pac' && a.type !== 'deposit' && Number(a.archived) === 0);
    const pacOpts = pacAccounts.length === 0
        ? '<option value="">— nessun conto PAC —</option>'
        : ['<option value="">Seleziona…</option>']
            .concat(pacAccounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)).join('');
    planForm.querySelector('select[data-role="pac-account"]').innerHTML = pacOpts;
    const srcOpts = ['<option value="">— da scegliere al primo versamento —</option>']
        .concat(sourceAccounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)).join('');
    planForm.querySelector('select[data-role="source-account"]').innerHTML = srcOpts;
}

async function loadFunds() {
    const r = await apiGuard(api.get(`${BASE}/pac/funds`, { include_archived: 0 }));
    funds = r.data?.funds ?? [];
    const opts = ['<option value="">Seleziona…</option>']
        .concat(funds.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`)).join('');
    planForm.querySelector('select[data-role="fund"]').innerHTML = opts;
    changeForm.querySelector('select[data-role="change-fund"]').innerHTML = opts;
}

async function loadAssetClasses() {
    try {
        const r = await apiGuard(api.get(`${BASE}/securities/asset-classes`, {}));
        const list = r.data?.asset_classes ?? [];
        const opts = ['<option value="">—</option>']
            .concat(list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)).join('');
        fundForm.querySelector('select[data-role="fund-asset-class"]').innerHTML = opts;
    } catch { /* non bloccante */ }
}

async function loadPlans() {
    listEl.innerHTML = `<div class="text-center text-muted py-3">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…</div>`;
    const r = await apiGuard(api.get(`${BASE}/pac/plans`, {}));
    plans = r.data?.plans ?? [];
    renderKpi();
    renderPlans();
}

function renderKpi() {
    if (!plans.length) {
        kpiEl.innerHTML = '';
        return;
    }
    let invested = 0, current = 0, hasMarked = false, pnl = 0;
    for (const p of plans) {
        invested += Number(p.total_amount) || 0;
        if (p.current_value !== null) {
            current   += Number(p.current_value);
            pnl       += Number(p.unrealized_pnl) || 0;
            hasMarked  = true;
        }
    }
    const pnlCls = pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : 'text-muted');
    kpiEl.innerHTML = `
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Versato totale</div>
            <div class="h5 mb-0">${escapeHtml(fmtMoney(invested))}</div>
        </div></div></div>
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Valore attuale</div>
            <div class="h5 mb-0">${hasMarked ? escapeHtml(fmtMoney(current)) : '<span class="text-muted">aggiorna NAV</span>'}</div>
        </div></div></div>
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">P&L</div>
            <div class="h5 mb-0 ${pnlCls}">${hasMarked ? escapeHtml(fmtMoney(pnl)) : '—'}</div>
        </div></div></div>
        <div class="col-6 col-md-3"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-muted">Piani</div>
            <div class="h5 mb-0">${plans.filter(p => Number(p.active) === 1).length}/${plans.length}</div>
        </div></div></div>`;
}

function renderPlans() {
    if (!plans.length) {
        listEl.innerHTML = `<div class="text-center text-muted py-3">
            Nessun piano. Crea il primo qui a sinistra.</div>`;
        return;
    }
    const rows = plans.map(p => {
        const cls = p.asset_class_name
            ? `<span class="badge me-1" style="background:${escapeAttr(p.asset_class_color || '#6c757d')}">${escapeHtml(p.asset_class_name)}</span>`
            : '';
        const detailUrl = `${BASE}/pac/plan?id=${p.id}`;
        const pnlCls = p.unrealized_pnl !== null
            ? (Number(p.unrealized_pnl) > 0 ? 'text-success' : (Number(p.unrealized_pnl) < 0 ? 'text-danger' : 'text-muted'))
            : 'text-muted';
        const archived = Number(p.active) === 0
            ? '<span class="badge bg-secondary ms-1">off</span>' : '';
        return `
            <tr>
                <td>
                    ${cls}
                    <a href="${detailUrl}"><strong>${escapeHtml(p.name)}</strong></a>${archived}
                    <div class="small text-muted">
                        ${escapeHtml(FREQ_LABEL[p.frequency] || p.frequency)}
                        · ${escapeHtml(fmtMoney(p.amount))} → ${escapeHtml(p.fund_name || '—')}
                    </div>
                </td>
                <td class="text-end">${escapeHtml(p.total_contributions || 0)}</td>
                <td class="text-end">${escapeHtml(fmtMoney(p.total_amount))}</td>
                <td class="text-end">${p.current_value !== null ? escapeHtml(fmtMoney(p.current_value)) : '<span class="text-muted">—</span>'}</td>
                <td class="text-end ${pnlCls}">${p.unrealized_pnl !== null ? escapeHtml(fmtMoney(p.unrealized_pnl)) : '<span class="text-muted">—</span>'}</td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-action="fund"
                            data-id="${escapeAttr(p.id)}" title="Cambia fondo">
                        <i class="bi bi-arrow-left-right"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-action="toggle"
                            data-id="${escapeAttr(p.id)}" data-active="${Number(p.active) === 1 ? 0 : 1}">
                        <i class="bi bi-${Number(p.active) === 1 ? 'pause' : 'play'}-fill"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${escapeAttr(p.id)}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
    listEl.innerHTML = `
        <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
            <thead><tr class="small text-muted">
                <th>Piano</th>
                <th class="text-end"># vers.</th>
                <th class="text-end">Versato</th>
                <th class="text-end">Valore</th>
                <th class="text-end">P&L</th>
                <th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;
}

planForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(planForm);
    try {
        await send(`${BASE}/pac/plans/create`, Object.fromEntries(fd.entries()));
        toast.success('Piano creato.');
        planForm.reset();
        await loadPlans();
    } catch (err) {
        toast.error(err.message ?? 'Errore creazione piano.');
    }
});

listEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const plan = plans.find(x => String(x.id) === String(id));
    if (!plan) return;

    if (btn.dataset.action === 'fund') {
        changeForm.elements['id'].value = plan.id;
        changeForm.elements['fund_id'].value = String(plan.fund_id ?? '');
        changeForm.querySelector('[data-role="change-plan-name"]').textContent = plan.name;
        openModal(changeModal);
        return;
    }

    if (btn.dataset.action === 'toggle') {
        try {
            await send(`${BASE}/pac/plans/toggle`, { id, active: btn.dataset.active });
            await loadPlans();
        } catch (err) {
            toast.error(err.message ?? 'Errore toggle.');
        }
        return;
    }

    if (btn.dataset.action === 'delete') {
        const ok = await confirmDialog(
            `Eliminare il piano "${plan.name}"? Tutte le contribuzioni associate verranno rimosse.`,
            { confirmText: 'Elimina', confirmClass: 'btn-danger' }
        );
        if (!ok) return;
        try {
            await send(`${BASE}/pac/plans/delete`, { id });
            toast.success('Piano eliminato.');
            await loadPlans();
        } catch (err) {
            toast.error(err.message ?? 'Errore eliminazione.');
        }
    }
});

document.addEventListener('click', (ev) => {
    const open  = ev.target.closest('a[data-action="new-fund"]');
    if (open) { ev.preventDefault(); openModal(fundModal); }
    if (ev.target.closest('[data-fund-action="close"]'))   closeModal(fundModal);
    if (ev.target.closest('[data-change-action="close"]')) closeModal(changeModal);
});

function openModal(el) {
    if (!el) return;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
}
function closeModal(el) {
    if (!el) return;
    if (typeof el.close === 'function') el.close();
    else el.removeAttribute('open');
}

// Cambiare fondo rifa' le quote di tutti i versamenti: se il fondo nuovo non
// ha quotazioni vecchie quanto il piano, qualche versamento resta senza quote
// e l'avviso lo dice, invece di mostrare un valore che manca di un pezzo.
changeForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(changeForm).entries());
    if (!fd.fund_id) { toast.error('Scegli il fondo.'); return; }
    try {
        const r = await send(`${BASE}/pac/plans/change-fund`, fd);
        const d = r?.data ?? {};
        closeModal(changeModal);
        const scoperti = Number(d.total ?? 0) - Number(d.recalculated ?? 0);
        toast.success(scoperti > 0
            ? `Piano spostato. ${scoperti} versamenti su ${d.total} restano senza quote: `
              + 'scarica le quotazioni del fondo nuovo dalla scheda del piano.'
            : `Piano spostato su ${escapeHtml(d.plan?.fund_name ?? 'il fondo scelto')}, `
              + `${d.recalculated} versamenti ricalcolati.`);
        await loadPlans();
    } catch (err) {
        toast.error(err.message ?? 'Errore cambio fondo.');
    }
});

fundForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(fundForm);
    try {
        const r = await send(`${BASE}/pac/funds/create`, Object.fromEntries(fd.entries()));
        toast.success('Fondo creato.');
        fundForm.reset();
        fundForm.elements['currency'].value = 'EUR';
        closeModal(fundModal);
        await loadFunds();
        const newId = r.data?.fund?.id;
        if (newId) planForm.elements['fund_id'].value = String(newId);
    } catch (err) {
        toast.error(err.message ?? 'Errore creazione fondo.');
    }
});

(async () => {
    try {
        await Promise.all([loadAccounts(), loadFunds(), loadAssetClasses()]);
        if (pacAccounts.length === 0) {
            kpiEl.innerHTML = `<div class="col-12">
                <div class="alert alert-info mb-0">
                    Per creare un piano PAC crea prima un conto di tipo
                    <b>Piano accumulo</b> in <a href="${BASE}/accounts">Conti</a>.
                </div></div>`;
            listEl.innerHTML = '';
            return;
        }
        await loadPlans();
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento PAC.');
    }
})();
