// ─── pac-split.js ────────────────────────────────────────────────────────────
// La finestra che divide un'uscita fra i piani di accumulo.
//
// La usano in due: l'anteprima dell'import bancario, dove la divisione resta
// nella riga finche' non si conferma, e l'elenco delle spese, dove viene
// salvata subito. Per questo qui non c'e' nessuna chiamata al server: si apre,
// si raccolgono le quote, si passano a chi ha chiamato.

import { escapeAttr, escapeHtml } from './componentBase.js';
import { fmtMoney } from './format.js';


const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const el = (id) => document.getElementById(id);

let context = null;   // {amount, plans, onApply}

/** Le quote scritte adesso nei campi, senza gli zeri. */
function currentShares() {
    return [...el('pac-split-rows').querySelectorAll('input[data-plan-id]')]
        .map((input) => ({ plan_id: Number(input.dataset.planId), amount: round2(input.value.replace(',', '.')) }))
        .filter((share) => share.amount > 0);
}

function updateResidual() {
    const assigned = round2(currentShares().reduce((sum, share) => sum + share.amount, 0));
    const remaining = round2(context.amount - assigned);
    const out = el('pac-split-residual');
    if (assigned === 0) {
        out.className = 'mt-2 small text-muted';
        out.textContent = `Da assegnare: ${fmtMoney(context.amount)}`;
    } else if (remaining === 0) {
        out.className = 'mt-2 small text-success';
        out.textContent = `Le quote fanno ${fmtMoney(assigned)}: torna.`;
    } else if (remaining > 0) {
        out.className = 'mt-2 small text-danger';
        out.textContent = `Mancano ${fmtMoney(remaining)} (assegnati ${fmtMoney(assigned)} su ${fmtMoney(context.amount)}).`;
    } else {
        out.className = 'mt-2 small text-danger';
        out.textContent = `Ci sono ${fmtMoney(-remaining)} di troppo (assegnati ${fmtMoney(assigned)} su ${fmtMoney(context.amount)}).`;
    }
    el('pac-split-apply').disabled = remaining !== 0;
}

function renderRows(shares) {
    const byPlan = new Map(shares.map((share) => [Number(share.plan_id), Number(share.amount)]));
    el('pac-split-rows').innerHTML = context.plans.map((plan) => `
        <div class="d-flex align-items-center gap-2">
            <div class="flex-grow-1">
                <div>${escapeHtml(plan.name)}</div>
                <div class="small text-muted">${escapeHtml(plan.fund_name || '—')} · previsti ${escapeHtml(fmtMoney(plan.amount))}</div>
            </div>
            <div class="input-group input-group-sm" style="max-width:160px">
                <span class="input-group-text">&euro;</span>
                <input type="number" step="0.01" min="0" class="form-control text-end"
                       data-plan-id="${escapeAttr(plan.id)}"
                       value="${byPlan.has(plan.id) ? escapeAttr(byPlan.get(plan.id).toFixed(2)) : ''}"
                       placeholder="0,00" aria-label="Quota per ${escapeAttr(plan.name)}">
            </div>
        </div>`).join('');
}

/**
 * Apre la finestra.
 *
 * `onApply(shares)` puo' essere asincrona: se lancia, il messaggio finisce
 * sotto i campi e la finestra resta aperta, cosi' non si perde quel che c'era
 * scritto. Con l'elenco vuoto vuol dire «non e' un versamento».
 */
export function openPacSplit({ amount, date, description, plans, shares, onApply }) {
    const modalEl = el('pac-split-modal');
    if (!modalEl || !Array.isArray(plans) || plans.length === 0) return false;

    context = { amount: round2(amount), plans, onApply };

    el('pac-split-amount').textContent = fmtMoney(context.amount);
    el('pac-split-date').textContent = date ?? '—';
    el('pac-split-desc').textContent = description ? String(description).slice(0, 120) : '';
    renderRows(Array.isArray(shares) ? shares : []);
    updateResidual();

    new bootstrap.Modal(modalEl).show();
    return true;
}

/** Riempie i campi con gli importi previsti dai piani. */
function fillFromPlans() {
    renderRows(context.plans.map((plan) => ({ plan_id: plan.id, amount: Number(plan.amount) })));
    updateResidual();
}

async function apply(shares) {
    const applyBtn = el('pac-split-apply');
    applyBtn.disabled = true;
    try {
        await context.onApply(shares);
        bootstrap.Modal.getInstance(el('pac-split-modal'))?.hide();
    } catch (err) {
        const out = el('pac-split-residual');
        out.className = 'mt-2 small text-danger';
        out.textContent = err.message ?? 'Non e\' stato possibile salvare la divisione.';
    } finally {
        applyBtn.disabled = false;
    }
}

export function wirePacSplitModal() {
    if (!el('pac-split-modal')) return;
    el('pac-split-rows').addEventListener('input', updateResidual);
    el('pac-split-fill').addEventListener('click', fillFromPlans);
    el('pac-split-apply').addEventListener('click', () => apply(currentShares()));
    el('pac-split-clear').addEventListener('click', () => apply([]));
}
