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

function ensureContainer() {
    let c = document.getElementById('toast-container');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container position-fixed top-0 end-0 p-3';
    c.style.zIndex = '1080';
    document.body.appendChild(c);
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
