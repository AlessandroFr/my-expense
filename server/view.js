/**
 * Rendering delle pagine.
 *
 * I template sono funzioni JavaScript che restituiscono HTML: nessun motore da
 * interpretare, nessuna dipendenza. Le pagine chiamano `page()`, che le avvolge
 * nel layout comune.
 *
 * Gli helper riproducono quelli di App\Views\View, perche' l'HTML prodotto deve
 * restare identico a quello di prima.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { publicDir } from './paths.js';

/** Come htmlspecialchars($v, ENT_QUOTES, 'UTF-8'): protegge anche gli apici. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * URL di un file statico con la data di modifica in coda: cosi' il browser
 * ricarica il file quando cambia, invece di tenersi la copia vecchia.
 */
export function asset(relPath) {
  const rel = relPath.replace(/^\/+/, '');
  const full = join(publicDir, rel);
  const v = existsSync(full) ? Math.floor(statSync(full).mtimeMs / 1000) : 0;
  return esc(`/${rel}?v=${v}`);
}

/** Campo nascosto col token CSRF, gemello del cookie letto da FetchRequest.js. */
export const csrfField = (token) =>
  `<input type="hidden" name="_csrf" value="${esc(token)}">`;

const NOME_APP = 'My Expense';

/** Le voci di menu che devono risultare attive per il percorso corrente. */
function navState(path) {
  const matches = (prefissi) => prefissi.some((p) => path === p || path.startsWith(`${p.replace(/\/$/, '')}/`));
  return {
    dashboard: matches(['/dashboard']),
    movements: matches(['/expenses', '/incomes', '/recurring', '/transfers']),
    plan: matches(['/categories', '/budgets', '/accounts', '/contacts', '/securities', '/pac']),
    reports: matches(['/reports']),
  };
}

/**
 * Avvolge il contenuto nel layout comune.
 *
 * @param {{title: string, path: string, username: string, csrfToken: string, content: string, head?: string, scripts?: string}} o
 */
export function page(o) {
  const nav = navState(o.path ?? '/');
  const attivo = (b) => (b ? ' active' : '');
  const iniziale = o.username && o.username !== ''
    ? [...o.username][0].toUpperCase()
    : '?';

  return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(`${o.title ?? ''} - ${NOME_APP}`)}</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="${asset('css/pastel.css')}">
    <link rel="stylesheet" href="${asset('css/transitions.css')}">

    <!-- PWA -->
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="theme-color" content="#9B7CD9">
    <link rel="apple-touch-icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%239B7CD9'/><stop offset='1' stop-color='%23FF9D6E'/></linearGradient></defs><rect width='192' height='192' rx='40' fill='url(%23g)'/><text x='50%25' y='52%25' font-family='system-ui' font-size='110' font-weight='bold' fill='white' text-anchor='middle' dominant-baseline='middle'>%E2%82%AC</text></svg>">
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').catch(function(){});
            });
        }
    </script>

    <!-- Tema: applicato in head per evitare FOUC -->
    <script>
        (function() {
            try {
                var m = localStorage.getItem('mx-theme') || 'auto';
                var r = (m === 'auto')
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : (m === 'dark' ? 'dark' : 'light');
                document.documentElement.setAttribute('data-bs-theme', r);
            } catch (e) {}
        })();
    </script>
${o.head ?? ''}</head>
<body data-base-url="">

<nav class="navbar navbar-expand bg-white border-bottom shadow-sm">
    <div class="container">
        <a class="navbar-brand fw-semibold" href="/dashboard">
            <i class="bi bi-wallet2 me-1"></i>${esc(NOME_APP)}
        </a>
        <ul class="navbar-nav flex-row gap-1 ms-3">
            <li class="nav-item">
                <a class="nav-link${attivo(nav.dashboard)}" href="/dashboard">
                    <i class="bi bi-speedometer2 me-1"></i>Dashboard
                </a>
            </li>
            <li class="nav-item dropdown${attivo(nav.movements)}">
                <a class="nav-link dropdown-toggle${attivo(nav.movements)}" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-arrow-left-right me-1"></i>Movimenti
                </a>
                <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="/expenses"><i class="bi bi-receipt me-2"></i>Spese</a></li>
                    <li><a class="dropdown-item" href="/incomes"><i class="bi bi-cash-stack me-2"></i>Entrate</a></li>
                    <li><a class="dropdown-item" href="/transfers"><i class="bi bi-arrow-left-right me-2"></i>Trasferimenti</a></li>
                    <li><a class="dropdown-item" href="/recurring"><i class="bi bi-arrow-repeat me-2"></i>Ricorrenti</a></li>
                </ul>
            </li>
            <li class="nav-item dropdown${attivo(nav.plan)}">
                <a class="nav-link dropdown-toggle${attivo(nav.plan)}" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-sliders2 me-1"></i>Pianifica
                </a>
                <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="/categories"><i class="bi bi-tags me-2"></i>Categorie</a></li>
                    <li><a class="dropdown-item" href="/budgets"><i class="bi bi-bullseye me-2"></i>Budget</a></li>
                    <li><a class="dropdown-item" href="/accounts"><i class="bi bi-bank me-2"></i>Conti</a></li>
                    <li><a class="dropdown-item" href="/securities"><i class="bi bi-graph-up-arrow me-2"></i>Investimenti</a></li>
                    <li><a class="dropdown-item" href="/pac"><i class="bi bi-piggy-bank me-2"></i>Piani di Accumulo</a></li>
                    <li><a class="dropdown-item" href="/contacts"><i class="bi bi-person-rolodex me-2"></i>Anagrafiche</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a class="nav-link${attivo(nav.reports)}" href="/reports">
                    <i class="bi bi-bar-chart-steps me-1"></i>Report
                </a>
            </li>
        </ul>
        <div class="ms-auto">
            <div class="dropdown">
                <button type="button" class="mx-user-trigger" data-bs-toggle="dropdown" aria-expanded="false" title="Account">
                    <span class="mx-avatar">${esc(iniziale)}</span>
                    <span class="mx-user-name d-none d-md-inline">${esc(o.username ?? '')}</span>
                    <i class="bi bi-chevron-down mx-user-caret"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end mx-user-menu">
                    <li class="mx-theme-row">
                        <span class="mx-theme-label">Tema</span>
                        <div class="mx-theme-segments" role="group" aria-label="Tema">
                            <button type="button" class="mx-theme-btn" data-theme-mode="light" title="Chiaro" aria-label="Tema chiaro"><i class="bi bi-sun-fill"></i></button>
                            <button type="button" class="mx-theme-btn" data-theme-mode="dark" title="Scuro" aria-label="Tema scuro"><i class="bi bi-moon-stars-fill"></i></button>
                            <button type="button" class="mx-theme-btn" data-theme-mode="auto" title="Auto" aria-label="Tema automatico"><i class="bi bi-circle-half"></i></button>
                        </div>
                    </li>
                    <li><a class="dropdown-item" href="/backup/download"><i class="bi bi-cloud-download me-2"></i>Backup ZIP</a></li>
                    <li><a class="dropdown-item" href="/settings"><i class="bi bi-gear me-2"></i>Impostazioni</a></li>
                    <li><a class="dropdown-item" href="/wiki"><i class="bi bi-question-circle me-2"></i>Guida</a></li>
                </ul>
            </div>
        </div>
    </div>
</nav>

<main class="container py-4">
${o.content}
</main>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/tinymce@7.6.0/tinymce.min.js" referrerpolicy="origin"></script>
<script type="module" src="${asset('js/theme.js')}"></script>
<script type="module" src="${asset('js/icon-picker.js')}"></script>
<script type="module" src="${asset('js/rich-editor.js')}"></script>
<script type="module" src="${asset('js/wiki-link.js')}"></script>
${o.scripts ?? ''}</body>
</html>
`;
}

/** Ripete un frammento per ogni elemento, senza separatori. */
export const each = (items, fn) => (items ?? []).map(fn).join('');

/** Come empty() di PHP sui casi che i template usano davvero. */
export const vuoto = (v) => v === null || v === undefined || v === '' || v === 0 || v === '0'
  || (Array.isArray(v) && v.length === 0);

/** Come count(). */
export const quanti = (v) => (Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0));
