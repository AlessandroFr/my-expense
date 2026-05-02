// ─── pages/budgets.js ────────────────────────────────────────────────────────
// Budget mensili: list per mese + upsert form + delete + barre progresso.

import FetchRequest          from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, confirmDialog } from '../componentBase.js';
import { toast }             from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const monthInput = document.getElementById('budget-month');
const form       = document.getElementById('budget-form');
const list       = document.getElementById('budget-list');
const catSelect  = form.querySelector('select[name="category_id"]');

let categoriesCache = [];

function progressClass(pct) {
    if (pct >= 100) return 'bg-danger';
    if (pct >= 80)  return 'bg-warning';
    return 'bg-success';
}

function renderCard(b) {
    const pct      = Math.min(b.progress_pct, 100);
    const overFlag = b.progress_pct > 100;
    const cls      = progressClass(b.progress_pct);
    const icon     = b.icon ? `<i class="bi bi-${escapeHtml(b.icon)}"></i>` : '<i class="bi bi-tag"></i>';
    return `
    <div class="col-md-6 col-lg-4">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <div class="d-flex align-items-center mb-2">
                    <span class="badge me-2" style="background:${escapeHtml(b.color)}">${icon}</span>
                    <strong class="flex-grow-1">${escapeHtml(b.name)}</strong>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete"
                            data-cat="${b.category_id}" title="Rimuovi budget">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
                <div class="d-flex justify-content-between small mb-1">
                    <span>Speso <strong>${fmtMoney(b.spent)}</strong></span>
                    <span class="text-muted">su ${fmtMoney(b.amount)}</span>
                </div>
                <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="height:10px">
                    <div class="progress-bar ${cls}" style="width:${pct}%"></div>
                </div>
                <div class="d-flex justify-content-between small mt-1">
                    <span class="text-muted">${b.progress_pct.toFixed(1)}%</span>
                    <span class="${overFlag ? 'text-danger fw-semibold' : 'text-muted'}">
                        ${overFlag
                            ? `Over ${fmtMoney(-b.remaining)}`
                            : `Resta ${fmtMoney(b.remaining)}`}
                    </span>
                </div>
            </div>
        </div>
    </div>`;
}

function renderCategories() {
    catSelect.innerHTML = '<option value="">— scegli —</option>' +
        categoriesCache.map(c =>
            `<option value="${c.id}">${escapeHtml(c.name)}</option>`
        ).join('');
}

async function loadList() {
    const ym = monthInput.value;
    list.innerHTML = `<div class="col-12 text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…</div>`;
    try {
        const r = await apiGuard(api.get(`${BASE}/budgets/list`, { month: ym }));
        const d = r.data ?? {};
        categoriesCache = d.categories ?? [];
        renderCategories();
        const items = d.budgets ?? [];
        if (!items.length) {
            list.innerHTML = `<div class="col-12 text-center text-muted py-4">
                Nessun budget impostato per ${escapeHtml(ym)}. Aggiungine uno qui sopra.
            </div>`;
            return;
        }
        list.innerHTML = items.map(renderCard).join('''');
        stagger(list);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento budget.');
    }
}

list.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const ok = await confirmDialog('Rimuovere il budget di questa categoria?', {
        confirmText: 'Rimuovi', confirmClass: 'btn-danger',
    });
    if (!ok) return;
    try {
        await send(`${BASE}/budgets/delete`, {
            category_id: btn.dataset.cat,
            month:       monthInput.value,
        });
        toast.success('Budget rimosso.');
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore eliminazione budget.');
    }
});

form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    try {
        await send(`${BASE}/budgets/set`, {
            category_id: fd.get('category_id'),
            amount:      fd.get('amount'),
            month:       monthInput.value,
        });
        toast.success('Budget salvato.');
        form.reset();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore salvataggio budget.');
    }
});

monthInput.addEventListener('change', loadList);
document.addEventListener('DOMContentLoaded', loadList);
