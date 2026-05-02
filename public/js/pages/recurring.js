// ─── pages/recurring.js ──────────────────────────────────────────────────────
// CRUD spese ricorrenti + bottone "Genera ora" che crea le occorrenze pendenti.

import FetchRequest                                     from '../FetchRequest.js';
import { apiSend, apiGuard, escapeHtml, escapeAttr,
         confirmDialog, delegateTableClick }            from '../componentBase.js';
import { toast }                                         from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const FREQ_LABELS = { weekly: 'Settimanale', monthly: 'Mensile', yearly: 'Annuale' };

const tbody      = document.getElementById('recurring-tbody');
const createForm = document.getElementById('recurring-create-form');
const catSelect  = createForm.querySelector('select[name="category_id"]');
const runBtn     = document.getElementById('btn-run-now');

let cache = [];

function renderRow(it) {
    const cat = it.category_id
        ? `<span class="badge" style="background:${escapeAttr(it.category_color)}">${escapeHtml(it.category_name)}</span>`
        : '<span class="text-muted">-</span>';
    const desc = it.description ? escapeHtml(it.description) : '<span class="text-muted">-</span>';
    const lastGen = it.last_generated_date ? escapeHtml(it.last_generated_date) : '<span class="text-muted">mai</span>';
    const endDate = it.end_date ? escapeHtml(it.end_date) : '<span class="text-muted">-</span>';
    const activeBadge = Number(it.active) === 1
        ? '<span class="badge bg-success">attiva</span>'
        : '<span class="badge bg-secondary">disattiva</span>';
    const toggleIcon  = Number(it.active) === 1 ? 'bi-pause-circle' : 'bi-play-circle';
    return `
        <tr data-id="${it.id}">
            <td>${desc}</td>
            <td>${cat}</td>
            <td>${FREQ_LABELS[it.frequency] ?? escapeHtml(it.frequency)}</td>
            <td>${escapeHtml(it.start_date)}</td>
            <td>${endDate}</td>
            <td>${lastGen}</td>
            <td class="text-end fw-semibold">${fmtMoney(it.amount)}</td>
            <td>${activeBadge}</td>
            <td class="text-end text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="toggle" data-id="${it.id}" title="Attiva/disattiva">
                    <i class="bi ${toggleIcon}"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${it.id}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`;
}

function renderTable(items) {
    cache = items;
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">Nessuna ricorrenza configurata.</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(renderRow).join('');
}

function renderCategories(cats) {
    catSelect.innerHTML = '<option value="">- nessuna -</option>' +
        cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function loadList() {
    try {
        const r = await apiGuard(api.get(`${BASE}/recurring/list`));
        const d = r.data ?? {};
        renderCategories(d.categories ?? []);
        renderTable(d.items ?? []);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento ricorrenze.');
    }
}

createForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(createForm);
    const optimisticIt = {
        id: 'pending-' + Date.now(),
        category_id: fd.get('category_id'),
        category_color: '#6c757d',
        category_name: '',
        description: fd.get('description'),
        frequency:   fd.get('frequency'),
        start_date:  fd.get('start_date'),
        end_date:    fd.get('end_date'),
        last_generated_date: null,
        amount:      fd.get('amount'),
        active:      1,
    };
    const empty = tbody.querySelector('td[colspan]')?.closest('tr');
    if (empty) tbody.innerHTML = '';
    try {
        await optimisticCreate({
            container: tbody,
            makeOptimisticRow: () => {
                const t = document.createElement('tbody');
                t.innerHTML = renderRow(optimisticIt);
                return t.firstElementChild;
            },
            makeFinalRow: () => null,
            call: () => send(`${BASE}/recurring/create`, Object.fromEntries(fd.entries())),
            position: 'prepend',
        });
        toast.success('Ricorrenza aggiunta.');
        createForm.reset();
        createForm.querySelector('input[name="start_date"]').value = new Date().toISOString().slice(0, 10);
        loadList();
    } catch { /* toast already shown */ }
});

runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    try {
        const r = await send(`${BASE}/recurring/run`, {});
        const n = r.data?.created ?? 0;
        toast.success(n > 0 ? `${n} occorrenze generate.` : 'Niente da generare.');
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore generazione.');
    } finally {
        runBtn.disabled = false;
    }
});

delegateTableClick(tbody, {
    toggle: async (id) => {
        const it = cache.find(x => x.id == id);
        if (!it) return;
        const newActive = Number(it.active) === 1 ? 0 : 1;
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        try {
            await optimisticUpdate({
                row: tr,
                applyValues: () => {
                    const badge = tr.querySelector('.badge.bg-success, .badge.bg-secondary');
                    if (badge) {
                        badge.className = newActive === 1 ? 'badge bg-success' : 'badge bg-secondary';
                        badge.textContent = newActive === 1 ? 'attiva' : 'disattiva';
                    }
                    const ic = tr.querySelector('button[data-action="toggle"] i');
                    if (ic) ic.className = 'bi ' + (newActive === 1 ? 'bi-pause-circle' : 'bi-play-circle');
                },
                makeFinalRow: () => null,
                call: () => send(`${BASE}/recurring/toggle`, { id, active: newActive }),
            });
            loadList();
        } catch { /* toast shown */ }
    },
    delete: async (id) => {
        const ok = await confirmDialog('Eliminare questa ricorrenza? Le spese gia generate restano.', {
            confirmText: 'Elimina', confirmClass: 'btn-danger',
        });
        if (!ok) return;
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        if (!tr) return;
        try {
            await optimisticDelete({
                row: tr,
                call: () => send(`${BASE}/recurring/delete`, { id }),
            });
            toast.success('Ricorrenza eliminata.');
        } catch { /* toast shown */ }
    },
});

document.addEventListener('DOMContentLoaded', loadList);
