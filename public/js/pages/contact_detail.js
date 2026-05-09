// ─── pages/contact_detail.js ─────────────────────────────────────────────────
// Dettaglio singola anagrafica: KPI periodo, doughnut categorie, lista movimenti.
// + flusso "Riassegna movimenti" (modal con selezione per singolo movimento).

import FetchRequest from '../FetchRequest.js';
import { apiSend }   from '../componentBase.js';
import { toast }     from '../toast.js';
import { renderPager } from '../pager.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const ctx = window.MX_CONTACT ?? { id: 0, year: new Date().getFullYear() };

const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
function fmtAmount(v) { return fmt.format(Number(v) || 0); }
function escHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

const dateFmt = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(String(iso) + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? String(iso) : dateFmt.format(d);
}

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
            <td class="text-nowrap">${escHtml(fmtDate(r._date))}</td>
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

// ── Riassegnazione movimenti ────────────────────────────────────────────────
// Stato globale del modulo. selected è una Map keyed da `${kind}:${id}` per
// far sopravvivere la selezione tra le pagine del pager.

const REASSIGN_PAGE_SIZE = 50;
const reassign = {
    page: 1,
    rows: [],                    // movimenti pagina corrente
    selected: new Map(),         // key `${kind}:${id}` → {kind, id, target_contact_id|null}
    targets: [],                 // [{id, name}, ...] tutte le altre anagrafiche
    targetByName: new Map(),     // nome (lower) → id
    total: 0,
    loaded: false,
};

const KIND_LABEL = { expense: 'Spesa', income: 'Entrata', recurring: 'Ricorrente' };
const KIND_BADGE = {
    expense:   'bg-danger-subtle text-danger',
    income:    'bg-success-subtle text-success',
    recurring: 'bg-info-subtle text-info',
};

function selKey(kind, id) { return `${kind}:${id}`; }

async function ensureTargetsLoaded() {
    if (reassign.loaded) return;
    const resp = await api.get(`${BASE}/contacts/list?include_archived=1&page_size=0`);
    const all = resp?.data?.contacts ?? [];
    reassign.targets = all
        .filter(c => Number(c.id) !== Number(ctx.id))
        .map(c => ({ id: Number(c.id), name: String(c.name ?? '') }));
    reassign.targetByName = new Map(
        reassign.targets.map(c => [c.name.trim().toLowerCase(), c.id])
    );
    const dl = document.getElementById('reassign-targets-datalist');
    if (dl) {
        dl.innerHTML = reassign.targets
            .map(c => `<option value="${escHtml(c.name)}" data-id="${c.id}"></option>`)
            .join('');
    }
    reassign.loaded = true;
}

function resolveTargetId(name) {
    const k = String(name ?? '').trim().toLowerCase();
    if (k === '') return null;
    return reassign.targetByName.get(k) ?? null;
}

function updateSummary() {
    const el = document.getElementById('reassign-summary');
    const btn = document.querySelector('#reassign-form [data-action="confirm-reassign"]');
    if (el) el.textContent = `${reassign.selected.size} selezionati`;
    if (btn) btn.disabled = reassign.selected.size === 0;
}

function renderReassignRow(m) {
    const tr = document.createElement('tr');
    tr.dataset.kind = m.kind;
    tr.dataset.id = String(m.id);

    const isExpenseLike = m.kind !== 'income';
    const sign = isExpenseLike ? '−' : '+';
    const amountClass = isExpenseLike ? 'text-danger' : 'text-success';
    const cat = m.category_name ?? '—';
    const catColor = m.category_color ?? '#6c757d';

    const key = selKey(m.kind, m.id);
    const sel = reassign.selected.get(key);
    const checked = sel ? 'checked' : '';
    const targetName = sel?.target_contact_id
        ? (reassign.targets.find(t => t.id === sel.target_contact_id)?.name ?? '')
        : (document.getElementById('reassign-default-target')?.value ?? '');

    const recurringBadge = m.kind === 'recurring' && m.last_generated_date
        ? `<span class="badge bg-info-subtle text-info ms-1" title="Ultima generazione">ult. ${escHtml(fmtDate(m.last_generated_date))}</span>`
        : '';

    tr.innerHTML = `
        <td><input type="checkbox" class="form-check-input" data-action="toggle-row" ${checked}></td>
        <td><span class="badge ${KIND_BADGE[m.kind] ?? 'bg-secondary'}">${KIND_LABEL[m.kind] ?? m.kind}</span></td>
        <td class="text-nowrap">${escHtml(fmtDate(m.date))}</td>
        <td>
            <span class="d-inline-block rounded-circle me-1" style="width:.6rem;height:.6rem;background-color:${escHtml(catColor)}"></span>
            ${escHtml(cat)} <span class="text-muted small">— ${escHtml(m.description || '')}</span>
            ${recurringBadge}
        </td>
        <td class="text-end ${amountClass}">${sign} ${fmtAmount(m.amount)}</td>
        <td>
            <input type="text" class="form-control form-control-sm reassign-row-target"
                   list="reassign-targets-datalist" autocomplete="off"
                   value="${escHtml(targetName)}" placeholder="Anagrafica destinazione…">
        </td>`;
    return tr;
}

function renderReassignRows() {
    const tbody = document.getElementById('reassign-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (reassign.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Nessun movimento residuo collegato a questa anagrafica.</td></tr>';
        return;
    }
    for (const m of reassign.rows) tbody.appendChild(renderReassignRow(m));
}

async function loadReassignPage(page) {
    reassign.page = Math.max(1, Number(page) || 1);
    const url = `${BASE}/contacts/movements?contact_id=${ctx.id}&page=${reassign.page}&page_size=${REASSIGN_PAGE_SIZE}`;
    try {
        const resp = await api.get(url);
        const data = resp?.data ?? {};
        reassign.rows = data.movements ?? [];
        reassign.total = Number(data.counts?.total ?? 0);
        renderReassignRows();
        renderPager(document.getElementById('reassign-pager'), {
            total: reassign.total,
            limit: REASSIGN_PAGE_SIZE,
            offset: (reassign.page - 1) * REASSIGN_PAGE_SIZE,
            label: 'movimenti',
            onChange: (newOffset) => {
                loadReassignPage(Math.floor(newOffset / REASSIGN_PAGE_SIZE) + 1);
            },
        });
        updateSummary();
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento movimenti.');
    }
}

async function openReassignModal() {
    const dlg = document.getElementById('reassign-modal');
    if (!dlg) return;
    reassign.selected.clear();
    reassign.page = 1;
    const defaultInput = document.getElementById('reassign-default-target');
    if (defaultInput) defaultInput.value = '';
    try {
        await ensureTargetsLoaded();
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento anagrafiche.');
        return;
    }
    if (reassign.targets.length === 0) {
        toast.warning('Non esistono altre anagrafiche verso cui riassegnare. Creane una in /contacts.');
        return;
    }
    dlg.showModal();
    await loadReassignPage(1);
}

function closeReassignModal() {
    document.getElementById('reassign-modal')?.close();
    document.getElementById('reassign-confirm-modal')?.close();
}

function applyDefaultToSelected() {
    const def = document.getElementById('reassign-default-target')?.value ?? '';
    const targetId = resolveTargetId(def);
    if (!targetId) {
        toast.error('Anagrafica destinazione predefinita non valida.');
        return;
    }
    const targetName = reassign.targets.find(t => t.id === targetId)?.name ?? '';
    let updated = 0;
    for (const [, sel] of reassign.selected) {
        sel.target_contact_id = targetId;
        updated++;
    }
    // Rispecchia nelle righe attualmente visibili.
    document.querySelectorAll('#reassign-tbody tr').forEach(tr => {
        const k = tr.dataset.kind, id = Number(tr.dataset.id);
        if (reassign.selected.has(selKey(k, id))) {
            const inp = tr.querySelector('.reassign-row-target');
            if (inp) {
                inp.value = targetName;
                inp.classList.remove('is-invalid');
            }
        }
    });
    if (updated === 0) {
        toast.info('Nessun movimento selezionato. Spunta prima i movimenti da riassegnare.');
    } else {
        toast.success(`Destinazione applicata a ${updated} selezionati.`);
    }
}

function syncRowFromInput(tr) {
    const k = tr.dataset.kind, id = Number(tr.dataset.id);
    const key = selKey(k, id);
    const sel = reassign.selected.get(key);
    if (!sel) return;
    const inp = tr.querySelector('.reassign-row-target');
    if (!inp) return;
    const tid = resolveTargetId(inp.value);
    sel.target_contact_id = tid;
    inp.classList.toggle('is-invalid', tid === null);
}

function toggleRowSelection(tr, on) {
    const k = tr.dataset.kind, id = Number(tr.dataset.id);
    const key = selKey(k, id);
    const checkbox = tr.querySelector('input[type="checkbox"][data-action="toggle-row"]');
    if (checkbox) checkbox.checked = !!on;
    if (on) {
        if (!reassign.selected.has(key)) {
            const inp = tr.querySelector('.reassign-row-target');
            const tid = resolveTargetId(inp?.value ?? '');
            reassign.selected.set(key, { kind: k, id, target_contact_id: tid });
        }
    } else {
        reassign.selected.delete(key);
        tr.querySelector('.reassign-row-target')?.classList.remove('is-invalid');
    }
    updateSummary();
}

function selectAllOnPage(on) {
    document.querySelectorAll('#reassign-tbody tr[data-id]').forEach(tr => {
        toggleRowSelection(tr, on);
    });
}

function selectByKindOnPage(kind) {
    document.querySelectorAll(`#reassign-tbody tr[data-kind="${kind}"]`).forEach(tr => {
        toggleRowSelection(tr, true);
    });
}

function validateAndCollectItems() {
    const items = [];
    let invalidCount = 0;
    // Sincronizza valori da input visibili nella pagina corrente prima di validare.
    document.querySelectorAll('#reassign-tbody tr[data-id]').forEach(tr => {
        const k = tr.dataset.kind, id = Number(tr.dataset.id);
        if (reassign.selected.has(selKey(k, id))) syncRowFromInput(tr);
    });
    for (const [, sel] of reassign.selected) {
        if (!sel.target_contact_id) {
            invalidCount++;
            // Evidenzia se la riga è nella pagina corrente.
            const tr = document.querySelector(
                `#reassign-tbody tr[data-kind="${sel.kind}"][data-id="${sel.id}"]`
            );
            tr?.querySelector('.reassign-row-target')?.classList.add('is-invalid');
            tr?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            continue;
        }
        items.push({ kind: sel.kind, id: sel.id, target_contact_id: sel.target_contact_id });
    }
    return { items, invalidCount };
}

function openConfirmModal(items) {
    const targets = new Set(items.map(i => i.target_contact_id));
    const msg = targets.size === 1
        ? `${items.length} movimenti verranno riassegnati a 1 anagrafica.`
        : `${items.length} movimenti verranno riassegnati a ${targets.size} anagrafiche differenti.`;
    document.getElementById('reassign-confirm-message').textContent = msg;
    document.getElementById('reassign-confirm-modal')?.showModal();
}

async function executeReassign() {
    const { items, invalidCount } = validateAndCollectItems();
    if (invalidCount > 0) {
        toast.error(`${invalidCount} movimenti non hanno una destinazione valida.`);
        return;
    }
    if (items.length === 0) {
        toast.error('Nessun movimento selezionato.');
        return;
    }
    const action = document.querySelector('input[name="source_action"]:checked')?.value ?? 'leave';
    const params = new URLSearchParams({
        _csrf:             getCsrfToken(),
        source_contact_id: String(ctx.id),
        source_action:     action,
        items:             JSON.stringify(items),
    });
    try {
        const resp = await send(`${BASE}/contacts/reassign`, params);
        const r = resp?.data?.result?.reassigned ?? {};
        const total = Number(r.expense || 0) + Number(r.income || 0) + Number(r.recurring || 0);
        toast.success(`${total} movimenti riassegnati.`);
        closeReassignModal();
        if (action === 'archive' || action === 'delete') {
            window.location.href = `${BASE}/contacts`;
        } else {
            load(ctx.year);
        }
    } catch (err) {
        toast.error(err.message ?? 'Errore riassegnazione.');
    }
}

function wireReassign() {
    document.querySelector('[data-action="reassign-open"]')?.addEventListener('click', openReassignModal);

    const dlg = document.getElementById('reassign-modal');
    dlg?.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-action="close-reassign"]')) {
            closeReassignModal();
        }
        if (ev.target.closest('[data-action="apply-default-to-selected"]')) {
            applyDefaultToSelected();
        }
        if (ev.target.closest('[data-action="select-page"]')) selectAllOnPage(true);
        if (ev.target.closest('[data-action="select-none"]')) selectAllOnPage(false);
        const kindBtn = ev.target.closest('[data-action="select-kind"]');
        if (kindBtn) selectByKindOnPage(kindBtn.dataset.kind);
    });

    const tbody = document.getElementById('reassign-tbody');
    tbody?.addEventListener('change', (ev) => {
        const row = ev.target.closest('tr[data-id]');
        if (!row) return;
        if (ev.target.matches('input[type="checkbox"][data-action="toggle-row"]')) {
            toggleRowSelection(row, ev.target.checked);
        } else if (ev.target.matches('.reassign-row-target')) {
            // se la riga non era selezionata, selezionala automaticamente quando l'utente sceglie un target
            if (!reassign.selected.has(selKey(row.dataset.kind, Number(row.dataset.id)))) {
                toggleRowSelection(row, true);
            } else {
                syncRowFromInput(row);
            }
        }
    });

    // toggle "tutti in questa pagina" via checkbox in header
    document.querySelector('[data-action="toggle-page-checkbox"]')?.addEventListener('change', (ev) => {
        selectAllOnPage(!!ev.target.checked);
    });

    document.getElementById('reassign-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const { items, invalidCount } = validateAndCollectItems();
        if (invalidCount > 0) {
            toast.error(`${invalidCount} movimenti non hanno una destinazione valida.`);
            return;
        }
        if (items.length === 0) {
            toast.error('Nessun movimento selezionato.');
            return;
        }
        openConfirmModal(items);
    });

    const cdlg = document.getElementById('reassign-confirm-modal');
    cdlg?.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-action="cancel-confirm"]')) {
            cdlg.close();
        }
        if (ev.target.closest('[data-action="execute-reassign"]')) {
            executeReassign();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    load(ctx.year);
    document.getElementById('year-picker')?.addEventListener('change', (ev) => {
        const y = Number(ev.target.value);
        const url = new URL(window.location.href);
        url.searchParams.set('year', String(y));
        window.location.href = url.toString();
    });
    wireReassign();
});
