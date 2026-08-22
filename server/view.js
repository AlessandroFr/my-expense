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

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { projectRoot, publicDir } from './paths.js';

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

/**
 * La versione in fondo al menu dell'account: e' l'unico modo per sapere, a
 * colpo d'occhio, se l'aggiornamento e' andato a buon fine (vedi
 * `electron/update.js`). Letta una volta sola all'avvio: dentro il pacchetto
 * il file non cambia mentre l'app gira.
 */
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).version ?? '';
  } catch {
    return '';
  }
})();

/** Le voci di menu che devono risultare attive per il percorso corrente. */
function navState(path) {
  const matches = (prefissi) => prefissi.some((p) => path === p || path.startsWith(`${p.replace(/\/$/, '')}/`));
  return {
    dashboard: matches(['/dashboard']),
    movements: matches(['/expenses', '/incomes', '/recurring', '/transfers']),
    plan: matches(['/categories', '/budgets', '/accounts', '/bank-profiles', '/contacts', '/securities', '/pac']),
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

    <link rel="stylesheet" href="/vendor/fonts.css">

    <link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css">
    <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.min.css">
    <link rel="stylesheet" href="${asset('css/pastel.css')}">
    <link rel="stylesheet" href="${asset('css/transitions.css')}">

    <!-- Il service worker esiste solo per disinstallarsi: vedi public/sw.js. -->
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
                    <li><a class="dropdown-item" href="/bank-profiles"><i class="bi bi-table me-2"></i>Profili banca</a></li>
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
                    <li><hr class="dropdown-divider"></li>
                    <li><span class="dropdown-item-text text-body-secondary small">Versione ${esc(VERSION)}</span></li>
                </ul>
            </div>
        </div>
    </div>
</nav>

<main class="container py-4">
${o.content}
</main>

<script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script>
<script src="/vendor/tinymce/tinymce.min.js"></script>
<script type="module" src="${asset('js/modal-guard.js')}"></script>
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
export const isEmpty = (v) => v === null || v === undefined || v === '' || v === 0 || v === '0'
  || (Array.isArray(v) && v.length === 0);

/** Come count(). */
export const countOf = (v) => (Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0));
