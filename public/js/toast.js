// ─── toast.js ────────────────────────────────────────────────────────────────
// Wrapper minimale sui Bootstrap 5 Toast.
// Uso:  import { toast } from './toast.js';
//       toast.success('Categoria creata');
//       toast.error('Validazione fallita: ...');

const ICONS = {
    success: 'bi-check-circle',
    danger:  'bi-x-circle',
    warning: 'bi-exclamation-triangle',
    info:    'bi-info-circle',
};

/**
 * Il posto dove appendere gli avvisi.
 *
 * Se c'e' una finestra `<dialog>` aperta, gli avvisi vanno dentro quella. Le
 * finestre native stanno nel «top layer» del browser, che e' sopra qualunque
 * z-index: un avviso appeso al `body` mentre una finestra e' aperta finirebbe
 * dietro, dove non si vede. Restando figlio della finestra, invece, sale con
 * lei — e continua a posizionarsi rispetto allo schermo, non alla finestra.
 *
 * Fra piu' finestre aperte si sceglie l'ultima del documento: quelle create al
 * momento (la conferma, il selettore delle icone) si appendono in fondo al
 * body, quindi e' quella che sta sopra.
 */
function ensureContainer() {
    const aperte = document.querySelectorAll('dialog[open]');
    const casa = aperte.length > 0 ? aperte[aperte.length - 1] : document.body;

    let c = document.getElementById('toast-container');
    if (!c) {
        c = document.createElement('div');
        c.id = 'toast-container';
        c.className = 'toast-container position-fixed top-0 end-0 p-3';
        c.style.zIndex = '1080';
    }
    if (c.parentNode !== casa) casa.appendChild(c);
    return c;
}

function show(message, variant = 'info', delay = 4000) {
    const container = ensureContainer();
    const icon = ICONS[variant] ?? ICONS.info;

    const wrap = document.createElement('div');
    wrap.className = `toast align-items-center text-bg-${variant} border-0`;
    wrap.setAttribute('role', 'alert');
    wrap.setAttribute('aria-live', 'assertive');
    wrap.setAttribute('aria-atomic', 'true');
    wrap.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                <i class="bi ${icon} me-2"></i><span></span>
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto"
                    data-bs-dismiss="toast" aria-label="Chiudi"></button>
        </div>`;
    wrap.querySelector('span').textContent = message;
    container.appendChild(wrap);

    const t = new bootstrap.Toast(wrap, { delay, autohide: true });
    wrap.addEventListener('hidden.bs.toast', () => wrap.remove(), { once: true });
    t.show();
    return t;
}

export const toast = {
    success: (msg, delay) => show(msg, 'success', delay),
    error:   (msg, delay) => show(msg, 'danger',  delay),
    warning: (msg, delay) => show(msg, 'warning', delay),
    info:    (msg, delay) => show(msg, 'info',    delay),
};

export default toast;
