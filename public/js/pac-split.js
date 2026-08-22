// ─── pac-split.js ────────────────────────────────────────────────────────────
// La finestra che divide un'uscita fra i piani di accumulo.
//
// La usano in due: l'anteprima dell'import bancario, dove la divisione resta
// nella riga finche' non si conferma, e l'elenco delle spese, dove viene
// salvata subito. Per questo qui non c'e' nessuna chiamata al server: si apre,
// si raccolgono le quote, si passano a chi ha chiamato.

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});

const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

function esc(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

let ctx = null;   // {amount, plans, onApply}

const el = (id) => document.getElementById(id);

/** Le quote scritte adesso nei campi, senza gli zeri. */
function currentShares() {
    return [...el('pac-split-rows').querySelectorAll('input[data-plan-id]')]
        .map((i) => ({ plan_id: Number(i.dataset.planId), amount: round2(i.value.replace(',', '.')) }))
        .filter((q) => q.amount > 0);
}

function updateResidual() {
    const somma = round2(currentShares().reduce((s, q) => s + q.amount, 0));
    const resto = round2(ctx.amount - somma);
    const out = el('pac-split-residual');
    if (somma === 0) {
        out.className = 'mt-2 small text-muted';
        out.textContent = `Da assegnare: ${fmtMoney(ctx.amount)}`;
    } else if (resto === 0) {
        out.className = 'mt-2 small text-success';
        out.textContent = `Le quote fanno ${fmtMoney(somma)}: torna.`;
    } else if (resto > 0) {
        out.className = 'mt-2 small text-danger';
        out.textContent = `Mancano ${fmtMoney(resto)} (assegnati ${fmtMoney(somma)} su ${fmtMoney(ctx.amount)}).`;
    } else {
        out.className = 'mt-2 small text-danger';
        out.textContent = `Ci sono ${fmtMoney(-resto)} di troppo (assegnati ${fmtMoney(somma)} su ${fmtMoney(ctx.amount)}).`;
    }
    el('pac-split-apply').disabled = resto !== 0;
}

function renderRows(shares) {
    const byPlan = new Map(shares.map((q) => [Number(q.plan_id), Number(q.amount)]));
    el('pac-split-rows').innerHTML = ctx.plans.map((p) => `
        <div class="d-flex align-items-center gap-2">
            <div class="flex-grow-1">
                <div>${esc(p.name)}</div>
                <div class="small text-muted">${esc(p.fund_name || '—')} · previsti ${esc(fmtMoney(p.amount))}</div>
            </div>
            <div class="input-group input-group-sm" style="max-width:160px">
                <span class="input-group-text">&euro;</span>
                <input type="number" step="0.01" min="0" class="form-control text-end"
                       data-plan-id="${esc(p.id)}" value="${byPlan.has(p.id) ? esc(byPlan.get(p.id).toFixed(2)) : ''}"
                       placeholder="0,00" aria-label="Quota per ${esc(p.name)}">
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

    ctx = { amount: round2(amount), plans, onApply };

    el('pac-split-amount').textContent = fmtMoney(ctx.amount);
    el('pac-split-date').textContent = date ?? '—';
    el('pac-split-desc').textContent = description ? String(description).slice(0, 120) : '';
    renderRows(Array.isArray(shares) ? shares : []);
    updateResidual();

    new bootstrap.Modal(modalEl).show();
    return true;
}

/** Riempie i campi con gli importi previsti dai piani. */
function fillFromPlans() {
    renderRows(ctx.plans.map((p) => ({ plan_id: p.id, amount: Number(p.amount) })));
    updateResidual();
}

async function apply(shares) {
    const btn = el('pac-split-apply');
    btn.disabled = true;
    try {
        await ctx.onApply(shares);
        bootstrap.Modal.getInstance(el('pac-split-modal'))?.hide();
    } catch (err) {
        const out = el('pac-split-residual');
        out.className = 'mt-2 small text-danger';
        out.textContent = err.message ?? 'Non e\' stato possibile salvare la divisione.';
    } finally {
        btn.disabled = false;
    }
}

export function wirePacSplitModal() {
    const modalEl = el('pac-split-modal');
    if (!modalEl) return;
    el('pac-split-rows').addEventListener('input', updateResidual);
    el('pac-split-fill').addEventListener('click', fillFromPlans);
    el('pac-split-apply').addEventListener('click', () => apply(currentShares()));
    el('pac-split-clear').addEventListener('click', () => apply([]));
}
