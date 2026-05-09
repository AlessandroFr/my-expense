// ─── components/quickCreateContact.js ───────────────────────────────────────
// Componente riusabile per consentire la creazione "on-the-fly" di un nuovo
// fornitore (contact) accanto a un input/datalist esistente. Mostra un piccolo
// pulsante "+ Crea «X»" quando il valore digitato non risolve a un id noto.
// Al click invia POST /contacts/quick-create che riusa Contact::findOrCreate
// (idempotente: se name_norm matcha gia' un contact lo restituisce, niente
// duplicati) e fa applyBackfill best-effort sulle operazioni orfane il cui
// description contiene il nome.

import FetchRequest from '../FetchRequest.js';
import { apiSend }   from '../componentBase.js';
import { toast }     from '../toast.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Aggancia il pattern "+ Crea «X»" a un input testuale collegato a un datalist.
 *
 * @param {Object} cfg
 * @param {HTMLInputElement} cfg.inputEl              - input collegato al datalist
 * @param {Map<string, number>} cfg.knownByName       - mappa lower(name)->id, mutata in-place al successo
 * @param {(id: number, name: string, color: string, created: boolean) => void} [cfg.onCreated]
 *        Callback invocata dopo create/lookup riuscito. L'host puo' aggiornare
 *        target locali, datalist, righe selezionate, ecc. `created=false`
 *        significa che il nome era gia' presente (lookup hit, no insert).
 * @param {HTMLElement} [cfg.anchorEl]                - dove inserire il button (default = parent dell'input)
 * @returns {() => void} cleanup function (rimuove listener + button)
 */
export function setupQuickCreate({ inputEl, knownByName, onCreated, anchorEl } = {}) {
    if (!(inputEl instanceof HTMLInputElement)) {
        throw new TypeError('setupQuickCreate: inputEl richiesto (HTMLInputElement).');
    }
    if (!(knownByName instanceof Map)) {
        throw new TypeError('setupQuickCreate: knownByName richiesto (Map).');
    }

    const anchor = anchorEl ?? inputEl.parentElement ?? inputEl;

    // Idempotenza: se la modal viene riaperta, evita button duplicati.
    const stale = anchor.querySelector(':scope > .mx-quick-create-btn');
    if (stale) stale.remove();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-link p-0 mt-1 mx-quick-create-btn';
    btn.style.display = 'none';
    btn.style.whiteSpace = 'nowrap';
    btn.innerHTML = '<i class="bi bi-plus-circle me-1"></i><span class="mx-quick-create-label"></span>';
    anchor.appendChild(btn);

    const labelSpan = btn.querySelector('.mx-quick-create-label');
    let busy = false;

    const currentValue = () => String(inputEl.value ?? '').trim();

    function refresh() {
        const v = currentValue();
        if (v === '' || knownByName.has(v.toLowerCase())) {
            btn.style.display = 'none';
            return;
        }
        labelSpan.textContent = `Crea «${v}»`;
        btn.style.display = '';
    }

    async function handleClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (busy) return;
        const name = currentValue();
        if (name === '') return;
        busy = true;
        btn.disabled = true;
        try {
            const params = new URLSearchParams({
                _csrf: getCsrfToken(),
                name,
            });
            const resp = await send(`${BASE}/contacts/quick-create`, params);
            const data = resp?.data ?? {};
            const id = Number(data.id);
            const finalName = String(data.name ?? name);
            const color = String(data.color ?? '#6c757d');
            const created = !!data.created;
            if (!Number.isFinite(id) || id <= 0) {
                throw new Error('Risposta non valida.');
            }
            knownByName.set(finalName.trim().toLowerCase(), id);
            inputEl.value = finalName;
            inputEl.classList.remove('is-invalid');
            if (typeof onCreated === 'function') {
                onCreated(id, finalName, color, created);
            }
            if (created) {
                toast.success(`Fornitore «${finalName}» creato.`);
            } else {
                toast.info(`«${finalName}» è già un fornitore esistente.`);
            }
            refresh();
        } catch (err) {
            toast.error(err?.message ?? 'Errore creazione fornitore.');
        } finally {
            busy = false;
            btn.disabled = false;
        }
    }

    // mousedown.preventDefault evita che il blur dell'input faccia sparire il
    // pulsante prima che il click parta (il click resta gestito dal listener).
    function handleMousedown(ev) { ev.preventDefault(); }

    inputEl.addEventListener('input', refresh);
    inputEl.addEventListener('focus', refresh);
    btn.addEventListener('mousedown', handleMousedown);
    btn.addEventListener('click', handleClick);

    refresh();

    return () => {
        inputEl.removeEventListener('input', refresh);
        inputEl.removeEventListener('focus', refresh);
        btn.removeEventListener('mousedown', handleMousedown);
        btn.removeEventListener('click', handleClick);
        btn.remove();
    };
}

export default setupQuickCreate;
