// ─── theme.js ────────────────────────────────────────────────────────────────
// Dark mode con persistenza in localStorage. Bootstrap 5.3 nativo via data-bs-theme.
// Modi: 'light', 'dark', 'auto' (segue prefers-color-scheme).

const STORAGE_KEY = 'mx-theme';

function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolved(mode) {
    if (mode === 'auto') return systemPrefersDark() ? 'dark' : 'light';
    return mode === 'dark' ? 'dark' : 'light';
}

export function getMode() {
    return localStorage.getItem(STORAGE_KEY) || 'auto';
}

export function setMode(mode) {
    if (!['light', 'dark', 'auto'].includes(mode)) mode = 'auto';
    localStorage.setItem(STORAGE_KEY, mode);
    apply();
    updateToggleUi();
}

export function apply() {
    const mode = getMode();
    document.documentElement.setAttribute('data-bs-theme', resolved(mode));
}

function updateToggleUi() {
    const mode = getMode();
    document.querySelectorAll('[data-theme-mode]').forEach(el => {
        el.classList.toggle('active', el.dataset.themeMode === mode);
    });
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) {
        const r = resolved(mode);
        icon.className = 'bi ' + (mode === 'auto'
            ? 'bi-circle-half'
            : (r === 'dark' ? 'bi-moon-stars-fill' : 'bi-sun-fill'));
    }
}

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => { if (getMode() === 'auto') apply(); });
}

apply();

document.addEventListener('DOMContentLoaded', () => {
    updateToggleUi();
    document.querySelectorAll('[data-theme-mode]').forEach(el => {
        el.addEventListener('click', (ev) => {
            ev.preventDefault();
            setMode(el.dataset.themeMode);
        });
    });
});
