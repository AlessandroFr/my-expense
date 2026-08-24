// ─── trade-mark.js ───────────────────────────────────────────────────────────
// La finestra che marca un'uscita come acquisto di titoli.
//
// Stessa forma della finestra dei versamenti nei piani: qui non c'e' nessuna
// chiamata al server, si apre, si raccoglie quel che l'utente ha scritto e lo
// si passa a chi ha chiamato. Cosi' la stessa finestra puo' servire l'elenco
// spese e, un domani, l'anteprima dell'import.


import { fmtMoney } from './format.js';
const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const el = (id) => document.getElementById(id);

let context = null;   // {amount, onApply}

/** Il prezzo per quota che verra' registrato, o il motivo per cui non si puo'. */
function updatePrice() {
    const out = el('trade-price');
    const quantity = num(el('trade-quantity').value);
    const fee = num(el('trade-fee').value);
    const apply = el('trade-apply');

    if (quantity <= 0) {
        out.className = 'mt-2 small text-muted';
        out.textContent = 'Scrivi quante quote hai comprato.';
        apply.disabled = true;
        return;
    }
    if (fee >= context.amount) {
        out.className = 'mt-2 small text-danger';
        out.textContent = 'Le commissioni non possono valere quanto tutto il movimento.';
        apply.disabled = true;
        return;
    }
    const price = (context.amount - fee) / quantity;
    out.className = 'mt-2 small text-success';
    out.textContent = `${fmtMoney(context.amount - fee)} per ${quantity} quote: `
        + `${fmtMoney(price)} l'una${fee > 0 ? `, più ${fmtMoney(fee)} di commissioni` : ''}.`;
    apply.disabled = false;
}

/**
 * Apre la finestra.
 *
 * @param {object} opts amount, date, description, instruments[], trade|null, onApply
 * @returns {boolean} false se la finestra non c'e' in pagina
 */
export function openTradeMark({ amount, date, description, instruments, trade, onApply }) {
    const modalEl = el('trade-modal');
    if (!modalEl) return false;

    context = { amount: Math.round((Number(amount) || 0) * 100) / 100, onApply };

    el('trade-amount').textContent = fmtMoney(context.amount);
    el('trade-date').textContent = date ?? '—';
    el('trade-desc').textContent = description ? String(description).slice(0, 120) : '';
    el('trade-instrument').innerHTML = instruments
        .map((i) => `<option value="${i.id}">${i.name}${i.ticker ? ` (${i.ticker})` : ''}</option>`)
        .join('');

    el('trade-instrument').value = String(trade?.instrument_id ?? instruments[0]?.id ?? '');
    el('trade-quantity').value = trade ? String(Number(trade.quantity)) : '';
    el('trade-fee').value = trade && Number(trade.fee) > 0 ? String(Number(trade.fee)) : '';
    el('trade-clear').classList.toggle('d-none', !trade);
    updatePrice();

    new bootstrap.Modal(modalEl).show();
    return true;
}

async function apply(payload) {
    const applyBtn = el('trade-apply');
    applyBtn.disabled = true;
    try {
        await context.onApply(payload);
        bootstrap.Modal.getInstance(el('trade-modal'))?.hide();
    } catch (err) {
        const out = el('trade-price');
        out.className = 'mt-2 small text-danger';
        out.textContent = err.message ?? "Non e' stato possibile registrare l'acquisto.";
    } finally {
        applyBtn.disabled = false;
    }
}

export function wireTradeModal() {
    if (!el('trade-modal')) return;
    el('trade-quantity').addEventListener('input', updatePrice);
    el('trade-fee').addEventListener('input', updatePrice);
    el('trade-apply').addEventListener('click', () => apply({
        instrument_id: el('trade-instrument').value,
        quantity: el('trade-quantity').value,
        fee: el('trade-fee').value || '0',
    }));
    el('trade-clear').addEventListener('click', () => apply({ quantity: '0' }));
}
