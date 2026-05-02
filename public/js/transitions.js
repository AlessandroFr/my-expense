// ─── transitions.js ──────────────────────────────────────────────────────────
// View Transitions API + animation helpers. Progressive enhancement:
// senza supporto, le funzioni eseguono direttamente il callback.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const supportsViewTransitions = typeof document.startViewTransition === 'function';

/**
 * Esegue un cambio di stato DOM dentro una View Transition. Se il browser non
 * supporta l'API, il callback viene eseguito direttamente.
 *
 * @param {() => void | Promise<void>} mutate
 * @param {{ skipIfReduced?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export async function withViewTransition(mutate, opts = {}) {
    if (!supportsViewTransitions || (reducedMotion && opts.skipIfReduced !== false)) {
        await mutate();
        return;
    }
    const t = document.startViewTransition(async () => { await mutate(); });
    try { await t.finished; } catch { /* skipped/aborted */ }
}

/**
 * Tween numerico count-up/down con tabular-nums e easing.
 *
 * @param {HTMLElement} el
 * @param {number} from
 * @param {number} to
 * @param {{ duration?: number, format?: (n: number) => string }} [opts]
 */
export function tweenNumber(el, from, to, opts = {}) {
    if (!el) return;
    const duration = reducedMotion ? 0 : (opts.duration ?? 600);
    const format = opts.format ?? ((n) => n.toFixed(2));
    if (duration === 0 || from === to) {
        el.textContent = format(to);
        return;
    }
    const start = performance.now();
    const ease  = (t) => 1 - Math.pow(1 - t, 3);
    function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = format(from + (to - from) * ease(t));
        if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

/**
 * FLIP animation: cattura le posizioni prima della mutazione, esegui la
 * mutazione, poi anima dalla posizione vecchia a quella nuova.
 *
 * @param {HTMLElement[]} elements - elementi con data-id stabile
 * @param {() => void} mutate
 */
export function flip(elements, mutate) {
    if (reducedMotion || !elements?.length) {
        mutate();
        return;
    }
    const first = new Map();
    elements.forEach(el => first.set(el.dataset.id ?? el, el.getBoundingClientRect()));

    mutate();

    elements.forEach(el => {
        const f = first.get(el.dataset.id ?? el);
        if (!f || !el.isConnected) return;
        const l = el.getBoundingClientRect();
        const dx = f.left - l.left;
        const dy = f.top  - l.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate(
            [
                { transform: `translate(${dx}px, ${dy}px)` },
                { transform: 'translate(0, 0)' },
            ],
            { duration: 320, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
        );
    });
}

/** Aggiunge classe enter (slide-in spring). */
export function animateEnter(el) {
    if (!el || reducedMotion) return;
    el.classList.add('mx-row-enter');
    el.addEventListener('animationend', () => el.classList.remove('mx-row-enter'), { once: true });
}

/** Promise che risolve a fine animazione di uscita. */
export function animateExit(el) {
    return new Promise((resolve) => {
        if (!el || reducedMotion) { resolve(); return; }
        el.classList.add('mx-row-exit');
        const done = () => resolve();
        el.addEventListener('animationend', done, { once: true });
        setTimeout(done, 500);
    });
}

/** Stagger di un container: applica --mx-stagger-i e classe mx-stagger. */
export function stagger(container) {
    if (!container) return;
    container.classList.add('mx-stagger');
    Array.from(container.children).forEach((child, i) => {
        child.style.setProperty('--mx-stagger-i', i);
    });
}

export const motion = {
    reduced: reducedMotion,
    supportsVT: supportsViewTransitions,
};
