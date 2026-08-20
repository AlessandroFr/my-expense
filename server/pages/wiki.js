import { esc, each, asset } from '../view.js';

const SEZIONI = [
  {
    "id": "intro",
    "icon": "bi-house-heart",
    "title": "Benvenuto",
    "app": null,
    "group": "Inizia"
  },
  {
    "id": "primi-passi",
    "icon": "bi-rocket-takeoff",
    "title": "Primi passi",
    "app": "/setup",
    "group": "Inizia"
  },
  {
    "id": "dashboard",
    "icon": "bi-speedometer2",
    "title": "Dashboard",
    "app": "/dashboard",
    "group": "Quotidianità"
  },
  {
    "id": "spese",
    "icon": "bi-receipt",
    "title": "Spese",
    "app": "/expenses",
    "group": "Quotidianità"
  },
  {
    "id": "entrate",
    "icon": "bi-cash-stack",
    "title": "Entrate",
    "app": "/incomes",
    "group": "Quotidianità"
  },
  {
    "id": "trasferimenti",
    "icon": "bi-arrow-left-right",
    "title": "Trasferimenti",
    "app": "/transfers",
    "group": "Quotidianità"
  },
  {
    "id": "ricorrenti",
    "icon": "bi-arrow-repeat",
    "title": "Spese ricorrenti",
    "app": "/recurring",
    "group": "Quotidianità"
  },
  {
    "id": "categorie",
    "icon": "bi-tags",
    "title": "Categorie",
    "app": "/categories",
    "group": "Pianifica"
  },
  {
    "id": "budget",
    "icon": "bi-bullseye",
    "title": "Budget mensili",
    "app": "/budgets",
    "group": "Pianifica"
  },
  {
    "id": "conti",
    "icon": "bi-bank",
    "title": "Conti multipli",
    "app": "/accounts",
    "group": "Pianifica"
  },
  {
    "id": "anagrafiche",
    "icon": "bi-person-rolodex",
    "title": "Anagrafiche",
    "app": "/contacts",
    "group": "Pianifica"
  },
  {
    "id": "investimenti",
    "icon": "bi-graph-up-arrow",
    "title": "Investimenti",
    "app": "/securities",
    "group": "Pianifica"
  },
  {
    "id": "pac",
    "icon": "bi-piggy-bank",
    "title": "Piani di Accumulo",
    "app": "/pac",
    "group": "Pianifica"
  },
  {
    "id": "report",
    "icon": "bi-bar-chart-steps",
    "title": "Report annuale",
    "app": "/reports",
    "group": "Analisi"
  },
  {
    "id": "rateizzazione",
    "icon": "bi-calendar-week",
    "title": "Rateizzazione",
    "app": null,
    "group": "Strumenti"
  },
  {
    "id": "ocr",
    "icon": "bi-camera",
    "title": "OCR scontrini",
    "app": null,
    "group": "Strumenti"
  },
  {
    "id": "import-csv",
    "icon": "bi-filetype-csv",
    "title": "Import / export CSV",
    "app": null,
    "group": "Strumenti"
  },
  {
    "id": "import-bancario",
    "icon": "bi-bank2",
    "title": "Import estratto conto",
    "app": null,
    "group": "Strumenti"
  },
  {
    "id": "backup-restore",
    "icon": "bi-cloud-download",
    "title": "Backup e ripristino",
    "app": "/backup/download",
    "group": "Manutenzione"
  },
  {
    "id": "reset-db",
    "icon": "bi-trash3",
    "title": "Reset database",
    "app": "/settings",
    "group": "Manutenzione"
  },
  {
    "id": "pwa-offline",
    "icon": "bi-phone",
    "title": "PWA e modalità offline",
    "app": null,
    "group": "Sistema"
  },
  {
    "id": "dark-mode",
    "icon": "bi-circle-half",
    "title": "Tema chiaro / scuro",
    "app": null,
    "group": "Sistema"
  },
  {
    "id": "sicurezza-privacy",
    "icon": "bi-shield-lock",
    "title": "Sicurezza e privacy",
    "app": null,
    "group": "Sistema"
  },
  {
    "id": "scorciatoie",
    "icon": "bi-keyboard",
    "title": "Riferimento rapido",
    "app": null,
    "group": "Sistema"
  }
];

/** Le sezioni raggruppate, nell'ordine in cui compaiono nell'indice. */
const GRUPPI = SEZIONI.reduce((acc, s) => {
  (acc[s.group] ??= []).push(s);
  return acc;
}, {});

/** Intestazione di sezione: titolo, ancora copiabile e link alla pagina. */
function intestazione(s) {
  const apri = s.app !== null
    ? `<a class="btn btn-sm btn-outline-primary wiki-open-app" href="${esc(s.app)}"><i class="bi bi-box-arrow-up-right me-1"></i>Apri nell'app</a>`
    : '';
  return `<header class="wiki-section-head">`
    + `<h2 id="${esc(s.id)}"><i class="bi ${esc(s.icon)}"></i>${esc(s.title)}`
    + `<button type="button" class="wiki-anchor-link" data-anchor="${esc(s.id)}" title="Copia link a questa sezione" aria-label="Copia link"><i class="bi bi-link-45deg"></i></button>`
    + `</h2>${apri}</header>`;
}

export const render = () => {
  const grouped = GRUPPI;
  return `
<style>
/* Anchor offset per non finire sotto la navbar / header ospite */
html { scroll-behavior: smooth; scroll-padding-top: 88px; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

/* Header ospite (visibile solo quando non loggati) */
.wiki-guest-bar {
    position: sticky; top: 0; z-index: 1020;
    background: var(--mx-paper);
    border-bottom: 1px solid var(--mx-line);
    box-shadow: var(--mx-shadow-sm);
    padding: 0.6rem 0;
    margin: -1.5rem 0 1.5rem;
}
.wiki-guest-bar .wiki-brand {
    font-weight: 800; letter-spacing: -0.03em; color: var(--mx-ink);
    display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none;
}
.wiki-guest-bar .wiki-brand::before {
    content: '€'; width: 28px; height: 28px; border-radius: 9px;
    background: linear-gradient(135deg, var(--mx-lilac-deep), var(--mx-peach-deep));
    color: white; display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 15px; box-shadow: 0 4px 12px rgba(155, 124, 217, 0.30);
}

/* Hero compatto wiki */
.wiki-hero { position: relative; }
.wiki-hero .wiki-search-input { max-width: 480px; }

/* TOC sticky */
.wiki-toc {
    position: sticky; top: 88px;
    max-height: calc(100vh - 110px);
    overflow-y: auto;
    padding-right: 0.5rem;
}
.wiki-toc .wiki-toc-group { font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--mx-ink-3); padding: 0.75rem 0.75rem 0.35rem; }
.wiki-toc a {
    display: flex; align-items: center; gap: 0.55rem;
    padding: 0.45rem 0.75rem; border-radius: var(--mx-r-sm);
    color: var(--mx-ink-2); text-decoration: none;
    font-size: 0.9rem; font-weight: 500;
    transition: background 120ms ease, color 120ms ease;
}
.wiki-toc a:hover { background: var(--mx-line-2); color: var(--mx-ink); }
.wiki-toc a.active {
    background: var(--mx-lilac); color: var(--mx-ink); font-weight: 600;
    box-shadow: inset 0 0 0 1px rgba(155, 124, 217, 0.18);
}
[data-bs-theme="dark"] .wiki-toc a.active {
    background: rgba(155, 124, 217, 0.20);
    box-shadow: inset 0 0 0 1px rgba(155, 124, 217, 0.30);
}
.wiki-toc a .bi { color: var(--mx-ink-3); flex: 0 0 auto; }
.wiki-toc a.active .bi { color: var(--mx-lilac-deep); }
[data-bs-theme="dark"] .wiki-toc a.active .bi { color: #B79DE5; }

/* Sezioni */
.wiki-section { margin-bottom: 3.5rem; scroll-margin-top: 88px; }
.wiki-section-head {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
    margin-bottom: 0.5rem;
}
.wiki-section-head h2 { margin: 0; font-size: 1.5rem; flex: 1 1 auto; display: flex; align-items: center; gap: 0.5rem; }
.wiki-section-head h2 .bi { color: var(--mx-lilac-deep); }
[data-bs-theme="dark"] .wiki-section-head h2 .bi { color: #B79DE5; }
.wiki-anchor-link {
    background: transparent; border: 0; color: var(--mx-ink-3);
    padding: 0.15rem 0.35rem; border-radius: 6px; cursor: pointer;
    opacity: 0; transition: opacity 150ms ease, background 120ms ease;
    font-size: 0.95rem;
}
.wiki-section-head:hover .wiki-anchor-link,
.wiki-anchor-link:focus { opacity: 1; }
.wiki-anchor-link:hover { background: var(--mx-line-2); color: var(--mx-lilac-deep); }

.wiki-section-lead { color: var(--mx-ink-2); font-size: 1.02rem; margin-bottom: 1rem; }

/* Mockup pane */
.mockup-pane {
    background: var(--mx-paper-2);
    border: 1px dashed var(--mx-line);
    border-radius: var(--mx-r);
    padding: 1rem 1.1rem;
    margin: 0.5rem 0 1rem;
    position: relative;
}
.mockup-pane::before {
    content: 'esempio';
    position: absolute; top: -0.55rem; left: 1rem;
    background: var(--mx-paper); color: var(--mx-ink-3);
    font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
    padding: 0 0.45rem; border-radius: 4px;
    border: 1px dashed var(--mx-line);
}
.mockup-pane table { font-size: 0.85rem; margin: 0; }
.mockup-pane .mini-card {
    background: var(--mx-paper); border: 1px solid var(--mx-line);
    border-radius: var(--mx-r-sm); padding: 0.6rem 0.85rem;
}

/* Pulsante "Apri nell'app" / placeholder ospite */
.wiki-open-app { white-space: nowrap; }
.wiki-open-app-disabled {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.25rem 0.5rem; border-radius: 6px;
    background: var(--mx-line-2); color: var(--mx-ink-3);
    font-size: 0.8rem; font-family: 'JetBrains Mono', monospace;
}

/* Highlight ricerca */
.wiki-section mark { background: var(--mx-yellow); color: var(--mx-ink); border-radius: 3px; padding: 0 2px; }
[data-bs-theme="dark"] .wiki-section mark { background: var(--mx-yellow-deep); color: #14122A; }

/* Pill informative */
.wiki-tip, .wiki-warn {
    display: flex; gap: 0.6rem; align-items: flex-start;
    padding: 0.7rem 0.9rem; border-radius: var(--mx-r-sm);
    margin: 0.75rem 0; font-size: 0.92rem;
}
.wiki-tip { background: rgba(91, 163, 240, 0.12); border-left: 3px solid var(--mx-sky-deep); }
.wiki-warn { background: rgba(255, 157, 110, 0.14); border-left: 3px solid var(--mx-peach-deep); }
.wiki-tip .bi, .wiki-warn .bi { font-size: 1.05rem; margin-top: 0.1rem; }

/* Dettagli avanzati */
.wiki-section details { margin: 0.6rem 0 0.4rem; }
.wiki-section details summary {
    cursor: pointer; font-weight: 600; color: var(--mx-ink-2);
    padding: 0.45rem 0.7rem; border-radius: var(--mx-r-sm);
    background: var(--mx-line-2); list-style: none;
}
.wiki-section details summary::-webkit-details-marker { display: none; }
.wiki-section details summary::before { content: '\\25B8  '; transition: transform 150ms ease; display: inline-block; }
.wiki-section details[open] summary::before { content: '\\25BE  '; }
.wiki-section details[open] summary { background: var(--mx-lilac); color: var(--mx-ink); }
[data-bs-theme="dark"] .wiki-section details[open] summary { background: rgba(155, 124, 217, 0.20); }
.wiki-section details > div { padding: 0.6rem 0.8rem 0.2rem; }

/* Mobile: TOC diventa offcanvas */
@media (max-width: 991.98px) {
    .wiki-toc { position: static; max-height: none; padding: 0; }
    .wiki-toc-mobile-trigger { display: inline-flex !important; }
}
.wiki-toc-mobile-trigger { display: none; }

/* Toast copy-link */
.wiki-copy-toast {
    position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%) translateY(150%);
    background: var(--mx-ink); color: var(--mx-paper);
    padding: 0.65rem 1.1rem; border-radius: var(--mx-r-sm);
    box-shadow: var(--mx-shadow-lg);
    font-size: 0.9rem; z-index: 1080;
    transition: transform 250ms ease;
}
.wiki-copy-toast.show { transform: translateX(-50%) translateY(0); }

/* Kbd estetica */
.wiki-kbd {
    display: inline-block; padding: 0.05rem 0.4rem;
    border: 1px solid var(--mx-line); border-bottom-width: 2px;
    border-radius: 5px; background: var(--mx-paper);
    font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 600;
}
</style>


<!-- HERO -->
<div class="mx-hero wiki-hero mb-4">
    <div class="mx-hero-label"><i class="bi bi-book me-1"></i>Guida utente</div>
    <div class="mx-hero-value">Come funziona my-expense</div>
    <p class="mb-3 mt-2" style="max-width: 720px; color: var(--mx-ink-2);">
        Un manuale completo per usare ogni funzione: dalla registrazione iniziale ai report annuali, dall'OCR degli scontrini all'import dell'estratto conto bancario. Tutto in una pagina: scorri, cerca, salta da una sezione all'altra con un click.
    </p>
    <div class="d-flex gap-2 flex-wrap align-items-center">
        <input type="search" id="wiki-search" class="form-control wiki-search-input" placeholder="🔍 Cerca nella guida (es. budget, OCR, ricariche)..." autocomplete="off" spellcheck="false">
        <button type="button" class="btn btn-outline-secondary btn-sm wiki-toc-mobile-trigger" data-bs-toggle="offcanvas" data-bs-target="#wiki-toc-offcanvas">
            <i class="bi bi-list-ul me-1"></i>Sezioni
        </button>
    </div>
</div>

<!-- Offcanvas TOC per mobile -->
<div class="offcanvas offcanvas-start" tabindex="-1" id="wiki-toc-offcanvas" aria-labelledby="wiki-toc-offcanvas-label">
    <div class="offcanvas-header">
        <h5 class="offcanvas-title" id="wiki-toc-offcanvas-label"><i class="bi bi-list-ul me-2"></i>Sezioni</h5>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Chiudi"></button>
    </div>
    <div class="offcanvas-body">
        <nav class="wiki-toc-nav">
            ${each(Object.entries(grouped), ([groupName, groupSections]) => `                <div class="wiki-toc-group">${esc(groupName)}</div>
                ${each(groupSections, (s) => `                    <a href="#${esc(s.id)}" data-bs-dismiss="offcanvas"><i class="bi ${esc(s.icon)}"></i><span>${esc(s.title)}</span></a>
                `)}            `)}        </nav>
    </div>
</div>

<!-- LAYOUT 2 COLONNE -->
<div class="row g-4">
    <!-- TOC sidebar (desktop) -->
    <aside class="col-lg-3 d-none d-lg-block">
        <nav class="wiki-toc">
            <div class="d-flex gap-1 mb-2">
                <button type="button" class="btn btn-sm btn-outline-secondary flex-fill" id="wiki-expand-all" title="Apri tutti i dettagli"><i class="bi bi-arrows-expand"></i> Espandi</button>
                <button type="button" class="btn btn-sm btn-outline-secondary flex-fill" id="wiki-collapse-all" title="Chiudi tutti i dettagli"><i class="bi bi-arrows-collapse"></i> Comprimi</button>
            </div>
            ${each(Object.entries(grouped), ([groupName, groupSections]) => `                <div class="wiki-toc-group">${esc(groupName)}</div>
                ${each(groupSections, (s) => `                    <a href="#${esc(s.id)}"><i class="bi ${esc(s.icon)}"></i><span>${esc(s.title)}</span></a>
                `)}            `)}        </nav>
    </aside>

    <!-- CONTENUTO -->
    <main class="col-12 col-lg-9" id="wiki-content">

<!-- ──────────────────────────────────────────────────────────── INTRO ─────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[0])}    <p class="wiki-section-lead">
        my-expense è un <strong>tracker personale delle finanze</strong>: registra spese, entrate e trasferimenti tra conti, calcola budget e bilanci, importa estratti conto bancari, fa OCR degli scontrini e ti aiuta a capire dove vanno i tuoi soldi.
    </p>
    <p>
        I dati vivono <strong>sul tuo computer</strong> (database MySQL locale via XAMPP). Non passano da nessun server esterno. Funziona in browser come applicazione web installabile (PWA), anche offline grazie alla cache del Service Worker.
    </p>
    <div class="row g-3 mt-1">
        <div class="col-md-4"><div class="mx-stat-card lilac"><div class="mx-stat-l">Domini</div><div class="mx-stat-v">17</div><div class="mx-stat-d">aree funzionali</div></div></div>
        <div class="col-md-4"><div class="mx-stat-card sky"><div class="mx-stat-l">Tabelle DB</div><div class="mx-stat-v">10+</div><div class="mx-stat-d">tutte scoped sull'utente</div></div></div>
        <div class="col-md-4"><div class="mx-stat-card yellow"><div class="mx-stat-l">Sezioni guida</div><div class="mx-stat-v">${SEZIONI.length}</div><div class="mx-stat-d">in questa pagina</div></div></div>
    </div>
    <div class="wiki-tip"><i class="bi bi-lightbulb"></i><div><strong>Suggerimento.</strong> Usa la barra di ricerca in alto per filtrare le sezioni, oppure passa il mouse sui titoli per copiare il link alla singola sezione.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── PRIMI PASSI ─ -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[1])}    <p class="wiki-section-lead">Tutto inizia con la pagina di <code>/setup</code>, dove crei l'unico utente del sistema. Da lì in poi userai sempre <code>/login</code>.</p>
    <ol>
        <li><strong>Registrazione (una sola volta).</strong> Visita <code>/setup</code>: scegli username e password (minimo 8 caratteri). La password viene salvata con bcrypt — il sistema non la conosce in chiaro.</li>
        <li><strong>Accesso.</strong> Da quel momento <code>/setup</code> è disabilitato per sempre. Usa <code>/login</code> con le tue credenziali.</li>
        <li><strong>Crea almeno un conto.</strong> Vai in <a href="#conti">Conti multipli</a> e aggiungi il tuo conto principale (corrente, contanti, carta…). Tutti i movimenti saranno collegati a un conto.</li>
        <li><strong>Personalizza le categorie.</strong> Trovi un set di partenza, ma puoi modificare nomi/colori/icone in <a href="#categorie">Categorie</a>.</li>
        <li><strong>Comincia a registrare.</strong> Vai a <a href="#spese">Spese</a> per la prima registrazione, oppure importa un estratto conto già esistente da <a href="#import-bancario">Import estratto conto</a>.</li>
    </ol>
    <div class="wiki-tip"><i class="bi bi-shield-check"></i><div>La pagina di setup è protetta: una volta creato l'utente non è più raggiungibile. Per "ricominciare da zero" usa il <a href="#reset-db">Reset database</a>.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── DASHBOARD ─── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[2])}    <p class="wiki-section-lead">La <strong>pagina d'arrivo</strong>: sintetizza il tuo periodo (mese in corso, trimestre, anno, ultimi 30/90 giorni o intervallo personalizzato) in quattro KPI e mostra grafici di tendenza.</p>
    <div class="mockup-pane">
        <div class="row g-2">
            <div class="col-6 col-md-3"><div class="mx-stat-card spese"><div class="mx-stat-l">Spese mese</div><div class="mx-stat-v mx-num">€ 1.247,80</div></div></div>
            <div class="col-6 col-md-3"><div class="mx-stat-card entrate"><div class="mx-stat-l">Entrate mese</div><div class="mx-stat-v mx-num">€ 2.100,00</div></div></div>
            <div class="col-6 col-md-3"><div class="mx-stat-card lilac"><div class="mx-stat-l">Bilancio netto</div><div class="mx-stat-v mx-num">+ € 852,20</div></div></div>
            <div class="col-6 col-md-3"><div class="mx-stat-card yellow"><div class="mx-stat-l">Variazione</div><div class="mx-stat-v mx-num">-7,5%</div></div></div>
        </div>
    </div>
    <p><strong>Cosa trovi:</strong></p>
    <ul>
        <li><strong>4 KPI</strong> in alto: Spese del periodo, Entrate, Bilancio netto, Variazione rispetto al periodo precedente.</li>
        <li><strong>Quick actions</strong>: 4 scorciatoie per registrare velocemente Nuova spesa / Entrata / Budget / Report.</li>
        <li><strong>Doughnut spese per categoria</strong>: vedi a colpo d'occhio dove va il denaro.</li>
        <li><strong>Doppio bar chart</strong>: spese rosse + entrate verdi negli ultimi 6 mesi per confronto immediato.</li>
        <li><strong>Widget budget</strong>: barre colorate (verde / giallo / rosso) per ogni budget attivo del mese.</li>
        <li><strong>Portafoglio investimenti</strong> se hai strumenti finanziari registrati.</li>
    </ul>
    <details><summary>Periodi disponibili</summary><div>
        Mese corrente · Mese scorso · Trimestre · Anno corrente · Ultimi 30 giorni · Ultimi 90 giorni · Ultimi 12 mesi · Personalizzato (intervallo libero).
    </div></details>
    <div class="wiki-tip"><i class="bi bi-info-circle"></i><div>Le <strong>spese ricorrenti scadute</strong> vengono generate automaticamente a ogni visita alla dashboard. Vedi <a href="#ricorrenti">Spese ricorrenti</a>.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── SPESE ─────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[3])}    <p class="wiki-section-lead">Il cuore dell'app: registra ogni uscita di denaro con data, importo, categoria, conto, metodo di pagamento, fornitore, tag e allegati.</p>

    <div class="mockup-pane">
        <table class="table table-sm table-borderless align-middle mb-0">
            <thead class="text-muted small">
                <tr><th>Data</th><th>Categoria</th><th>Descrizione</th><th>Tag</th><th class="text-end">Importo</th></tr>
            </thead>
            <tbody>
                <tr><td>05/05</td><td><span class="mx-pill" style="background:var(--mx-mint);color:var(--mx-mint-deep)">🛒 Spesa</span></td><td>Supermercato Esselunga</td><td><span class="mx-pill pos">famiglia</span></td><td class="text-end mx-num">€ 47,80</td></tr>
                <tr><td>04/05</td><td><span class="mx-pill" style="background:var(--mx-peach);color:var(--mx-peach-deep)">🍽 Ristorante</span></td><td>Pranzo Lucia</td><td><span class="mx-pill warn">amici</span></td><td class="text-end mx-num">€ 28,00</td></tr>
                <tr><td>03/05</td><td><span class="mx-pill" style="background:var(--mx-sky);color:var(--mx-sky-deep)">⛽ Carburante</span></td><td>Q8 tangenziale</td><td>—</td><td class="text-end mx-num">€ 62,30</td></tr>
            </tbody>
        </table>
    </div>

    <p><strong>Cosa puoi fare da <code>/expenses</code>:</strong></p>
    <ul>
        <li><strong>Form rapido in cima</strong>: registra una spesa in 3 secondi (data, categoria, importo, descrizione).</li>
        <li><strong>Modifica inline</strong>: clicca una riga per editarla senza cambiare pagina.</li>
        <li><strong>Filtri combinabili</strong>: data, categoria, conto, metodo pagamento, fornitore, tag, importo min/max, ricerca testuale (con debounce).</li>
        <li><strong>Filtri salvati</strong>: dai un nome alla combinazione che usi spesso e richiamala con un click.</li>
        <li><strong>Tag liberi</strong>: input CSV con autocomplete dai tag esistenti; chip colorate nelle righe.</li>
        <li><strong>Allegati</strong>: clip <i class="bi bi-paperclip"></i> per ogni riga → modal con upload (jpg/png/gif/webp/pdf, max 8 MB) + lista + view/download/delete.</li>
        <li><strong>Splitting condiviso</strong>: campi "diviso con" + "tua quota" per scontrini condivisi (l'importo totale resta, ma il bilancio considera solo la tua quota).</li>
        <li><strong>Rateizzazione</strong>: dividi una spesa grande in N rate. Vedi <a href="#rateizzazione">Rateizzazione</a>.</li>
        <li><strong>OCR scontrino</strong>: bottone "Scansiona scontrino" che usa la fotocamera del telefono. Vedi <a href="#ocr">OCR</a>.</li>
        <li><strong>Import / export CSV</strong>: vedi <a href="#import-csv">la sezione dedicata</a>.</li>
        <li><strong>Import estratto conto</strong>: per Banca Sella / Patavina, vedi <a href="#import-bancario">Import estratto conto</a>.</li>
    </ul>
    <details><summary>Campi di una spesa</summary><div>
        <code>data operazione</code>, <code>data valuta</code> (per i movimenti importati), <code>categoria</code>, <code>conto</code>, <code>metodo pagamento</code>, <code>fornitore/anagrafica</code>, <code>descrizione</code> (rich text), <code>importo totale</code>, <code>quota tua</code> (se splittata), <code>diviso con</code>, <code>tag</code>, <code>allegati</code>, <code>hash import</code> (se da estratto conto, usato per idempotenza).
    </div></details>
    <div class="wiki-tip"><i class="bi bi-bell"></i><div>Quando salvi una spesa, se la <strong>categoria ha un budget</strong> attivo nel mese, ricevi un <strong>toast warning</strong> appena raggiungi l'80% del budget e un <strong>toast error</strong> se lo superi. Vedi <a href="#budget">Budget</a>.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── ENTRATE ───── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[4])}    <p class="wiki-section-lead">Mirror simmetrico delle spese: stesso pattern (CRUD inline, filtri, CSV, allegati) ma con un campo libero <strong>"Fonte"</strong> al posto della categoria-pagamento (es. <em>Stipendio</em>, <em>Freelance</em>, <em>Rimborso</em>, <em>Bonifico da Mario</em>).</p>
    <ul>
        <li>Le entrate sono integrate nei KPI della <a href="#dashboard">Dashboard</a> e nel bilancio netto.</li>
        <li>Anche le entrate possono essere collegate a un'<a href="#anagrafiche">anagrafica</a> (es. il tuo datore di lavoro o un cliente).</li>
        <li>L'import dell'estratto conto trova automaticamente le entrate dai campi "Bonifico", "P2P", ecc.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── TRASFERIMENTI -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[5])}    <p class="wiki-section-lead">Sposti soldi tra <strong>due tuoi conti</strong> (es. dal corrente al contanti, o ricarica della prepagata). Il movimento non altera il bilancio totale, ma cambia i saldi dei singoli conti.</p>
    <div class="mockup-pane">
        <div class="d-flex align-items-center gap-3 flex-wrap">
            <div class="mini-card"><div class="text-muted small">Da</div><strong>Conto Corrente</strong><div class="text-danger mx-num">- € 200,00</div></div>
            <i class="bi bi-arrow-right fs-3 text-muted"></i>
            <div class="mini-card"><div class="text-muted small">A</div><strong>Carta Prepagata</strong><div class="text-success mx-num">+ € 200,00</div></div>
        </div>
    </div>
    <ul>
        <li><strong>Auto-causale al cambio conto</strong>: appena selezioni i due conti, la descrizione viene precompilata (es. "Ricarica da Corrente a Prepagata").</li>
        <li><strong>Paginazione lato server</strong>: la lista regge migliaia di righe senza appesantire il browser.</li>
        <li>I trasferimenti sono <strong>esclusi dai totali di spese ed entrate</strong> nelle liste <code>/expenses</code> e <code>/incomes</code> (sono "passaggi", non costi reali).</li>
    </ul>
    <div class="wiki-tip"><i class="bi bi-magic"></i><div>Quando importi un estratto conto, le <strong>ricariche di carte prepagate</strong> vengono riconosciute e trasformate automaticamente in una coppia spesa-entrata (vedi <a href="#import-bancario">partita doppia</a>).</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── RICORRENTI ── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[6])}    <p class="wiki-section-lead">Definisci una volta una spesa che si ripete (canone Netflix, mutuo, abbonamento palestra…) e my-expense la genera <strong>automaticamente</strong> ogni volta che è scaduta.</p>
    <ul>
        <li><strong>Frequenze</strong>: settimanale, mensile, annuale.</li>
        <li><strong>Data di inizio</strong> e <strong>data di fine opzionale</strong> (per abbonamenti a tempo determinato).</li>
        <li><strong>Generazione automatica</strong>: ad ogni visita alla <a href="#dashboard">Dashboard</a> il sistema controlla le ricorrenti scadute e inserisce le occorrenze mancanti, in modo idempotente (non duplica).</li>
        <li><strong>"Genera ora"</strong>: bottone per forzare la generazione senza aspettare la prossima visita.</li>
        <li><strong>Attivazione / disattivazione</strong> con un toggle, senza cancellare il template.</li>
    </ul>
    <details><summary>Come funziona l'idempotenza</summary><div>
        Ogni template ha un campo <code>last_generated_date</code>. La generazione calcola tutte le occorrenze tra <code>last_generated_date</code> e <em>oggi</em>, le inserisce in <code>expenses</code>, e aggiorna il campo. Se ricarichi la dashboard 10 volte di seguito, le occorrenze restano N (non N×10).
    </div></details>
</section>

<!-- ──────────────────────────────────────────────────────────── CATEGORIE ─── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[7])}    <p class="wiki-section-lead">Etichette per classificare le spese (e in parte le entrate). Ogni categoria ha <strong>nome, colore e icona Bootstrap</strong> personalizzabili.</p>
    <div class="mockup-pane d-flex gap-2 flex-wrap">
        <span class="mx-pill" style="background:var(--mx-mint);color:var(--mx-mint-deep)"><i class="bi bi-cart3 me-1"></i>Spesa</span>
        <span class="mx-pill" style="background:var(--mx-peach);color:var(--mx-peach-deep)"><i class="bi bi-cup-hot me-1"></i>Ristorante</span>
        <span class="mx-pill" style="background:var(--mx-sky);color:var(--mx-sky-deep)"><i class="bi bi-fuel-pump me-1"></i>Carburante</span>
        <span class="mx-pill" style="background:var(--mx-lilac);color:var(--mx-lilac-deep)"><i class="bi bi-controller me-1"></i>Svago</span>
        <span class="mx-pill" style="background:var(--mx-pink);color:var(--mx-neg)"><i class="bi bi-heart-pulse me-1"></i>Salute</span>
    </div>
    <ul>
        <li><strong>Nome unico</strong> per utente.</li>
        <li><strong>Sort order</strong>: trascina per riordinare nei dropdown.</li>
        <li><strong>Eliminazione protetta</strong>: se la categoria è usata da spese o budget, il sistema chiede conferma prima di "scollegare".</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── BUDGET ────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[8])}    <p class="wiki-section-lead">Definisci un <strong>tetto mensile per categoria</strong>. Il sistema calcola in tempo reale la percentuale già spesa e ti avvisa con colori a semaforo.</p>
    <div class="mockup-pane">
        <div class="mb-2"><strong>Spesa alimentare</strong> <span class="text-muted small ms-2">€ 320 / € 400</span>
            <div class="progress mt-1" style="height: 8px;"><div class="progress-bar bg-success" style="width: 80%"></div></div></div>
        <div class="mb-2"><strong>Ristoranti</strong> <span class="text-muted small ms-2">€ 165 / € 180</span>
            <div class="progress mt-1" style="height: 8px;"><div class="progress-bar bg-warning" style="width: 92%"></div></div></div>
        <div class="mb-0"><strong>Svago</strong> <span class="text-muted small ms-2">€ 215 / € 150</span>
            <div class="progress mt-1" style="height: 8px;"><div class="progress-bar bg-danger" style="width: 100%"></div></div></div>
    </div>
    <p><strong>Soglie:</strong></p>
    <ul>
        <li><span class="badge bg-success">Verde</span> sotto l'80% → tranquillo.</li>
        <li><span class="badge bg-warning text-dark">Giallo</span> tra 80% e 100% → attenzione, toast warning ogni nuova spesa.</li>
        <li><span class="badge bg-danger">Rosso</span> oltre il 100% → budget sforato, toast error ogni nuova spesa.</li>
    </ul>
    <p>I budget sono <strong>per mese</strong> (<code>YYYY-MM</code>): puoi avere budget diversi per gennaio e febbraio, oppure copiare quelli del mese precedente.</p>
</section>

<!-- ──────────────────────────────────────────────────────────── CONTI ─────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[9])}    <p class="wiki-section-lead">Gestisci <strong>conti multipli</strong> (corrente, contanti, carte, risparmio, investimenti). Ogni movimento è legato a un conto e ogni conto ha un saldo <strong>calcolato in tempo reale</strong>: apertura + entrate − spese.</p>
    <div class="mockup-pane row g-2">
        <div class="col-md-4"><div class="mini-card"><div class="text-muted small"><i class="bi bi-bank me-1"></i>Conto Corrente</div><div class="fs-5 fw-bold mx-num">€ 4.230,80</div></div></div>
        <div class="col-md-4"><div class="mini-card"><div class="text-muted small"><i class="bi bi-credit-card me-1"></i>Carta Prepagata</div><div class="fs-5 fw-bold mx-num">€ 78,50</div></div></div>
        <div class="col-md-4"><div class="mini-card"><div class="text-muted small"><i class="bi bi-cash me-1"></i>Contanti</div><div class="fs-5 fw-bold mx-num">€ 45,00</div></div></div>
    </div>
    <ul>
        <li><strong>Tipi</strong>: checking, card, cash, savings, investment, deposito titoli, PAC, other.</li>
        <li><strong>Dettagli opzionali</strong>: IBAN, BIC/SWIFT, nome banca, colore, icona.</li>
        <li><strong>Archivio invece di delete</strong>: i conti chiusi si archiviano per non perdere la storia dei movimenti.</li>
        <li><strong>Riconciliazione</strong>: confronti il saldo reale (es. del tuo home banking) con quello calcolato da my-expense e registri eventuali scarti.</li>
        <li>Filtro <strong>"Conto"</strong> presente in <code>/expenses</code> e <code>/incomes</code>.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── ANAGRAFICHE ─ -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[10])}    <p class="wiki-section-lead">Rubrica dei tuoi <strong>fornitori e controparti</strong>: negozi, professionisti, amici da rimborsare. Ogni movimento può essere collegato a un'anagrafica.</p>
    <ul>
        <li><strong>Campi</strong>: Nome, Partita IVA, IBAN, Email, Telefono.</li>
        <li><strong>Quick create inline</strong>: puoi crearne una al volo mentre registri una spesa.</li>
        <li><strong>Pagina dettaglio</strong>: bilancio annuale per anagrafica (spese ricevute, entrate, saldo netto), storico movimenti, filtri.</li>
        <li><strong>Ricerca</strong>: per nome, P.IVA, IBAN, email.</li>
        <li><strong>Merge duplicati</strong>: selezione multipla → fondi due o più anagrafiche in una sola. Utile dopo gli import bancari, che spesso creano leggere varianti dello stesso fornitore.</li>
        <li><strong>Archivio + riassegnazione</strong>: archivia un'anagrafica e riassegna tutti i suoi movimenti a un'altra.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── INVESTIMENTI -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[11])}    <p class="wiki-section-lead">Traccia <strong>strumenti finanziari</strong> (azioni, ETF, fondi, obbligazioni) detenuti su uno o più conti deposito.</p>
    <ul>
        <li><strong>Strumenti</strong> (instruments): nome, ticker, ISIN, classe d'asset (con gerarchia), nota.</li>
        <li><strong>Operazioni</strong>: BUY, SELL, DIVIDEND, FEE, SPLIT.</li>
        <li><strong>Prezzo / NAV</strong>: storico prezzi inseribili manualmente per calcolare il valore corrente.</li>
        <li><strong>Holdings</strong>: vista aggregata per conto deposito con quantità, prezzo medio di carico, valore corrente, P&amp;L.</li>
        <li><strong>KPI</strong>: patrimonio totale, gain/loss assoluto e percentuale.</li>
    </ul>
    <div class="wiki-tip"><i class="bi bi-info-circle"></i><div>Gli strumenti possono essere <strong>archiviati</strong> ma non eliminati se hanno operazioni: questo preserva la storia per il calcolo delle plusvalenze.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── PAC ───────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[12])}    <p class="wiki-section-lead">Piani di Accumulo Capitale: <strong>versamenti periodici</strong> su fondi/ETF con tracking della performance media.</p>
    <ul>
        <li><strong>Fondi</strong>: anagrafica con storico NAV.</li>
        <li><strong>Piani</strong>: importo, frequenza, data inizio/fine, toggle attivo / sospeso.</li>
        <li><strong>Versamenti</strong>: generati automaticamente dai piani attivi (come le <a href="#ricorrenti">ricorrenti</a>) oppure manualmente.</li>
        <li><strong>"Esegui tutti i versamenti scaduti"</strong>: bottone per allineare i piani in ritardo.</li>
        <li><strong>KPI</strong>: patrimonio PAC, versamenti accumulati, performance media.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── REPORT ────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[13])}    <p class="wiki-section-lead">Vista <strong>annuale</strong> per capire le tendenze di lungo periodo. Selezioni l'anno e vedi tutto consolidato.</p>
    <ul>
        <li><strong>4 KPI annuali</strong>: spese totali, entrate totali, bilancio anno, media mensile.</li>
        <li><strong>Bar + line chart</strong>: spese mensili (rosso) + entrate mensili (verde) + linea blu del bilancio cumulato.</li>
        <li><strong>Doughnut categorie</strong>: distribuzione percentuale sull'intero anno.</li>
        <li><strong>Heatmap top-5 categorie × 12 mesi</strong>: intensità di colore proporzionale al massimo (vedi a colpo d'occhio i picchi).</li>
        <li><strong>Top-10 spese singole</strong> dell'anno.</li>
        <li><strong>Bilancio per anagrafica</strong>: quanto hai speso/incassato con ciascun fornitore o cliente.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── RATEIZZAZIONE -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[14])}    <p class="wiki-section-lead">Dividi una spesa importante in <strong>più rate calendarizzate</strong>. Disponibile sia nel form manuale sia nell'esplosione dell'import bancario.</p>
    <div class="mockup-pane">
        <div class="text-muted small mb-2">Spesa originale: <strong>€ 600,00</strong> — Lavatrice MediaWorld — diviso in 3 rate mensili a partire dal 05/05:</div>
        <table class="table table-sm mb-0">
            <thead class="text-muted small"><tr><th>#</th><th>Data</th><th class="text-end">Importo</th></tr></thead>
            <tbody>
                <tr><td>1/3</td><td>05/05/2026</td><td class="text-end mx-num">€ 200,00</td></tr>
                <tr><td>2/3</td><td>05/06/2026</td><td class="text-end mx-num">€ 200,00</td></tr>
                <tr><td>3/3</td><td>05/07/2026</td><td class="text-end mx-num">€ 200,00</td></tr>
            </tbody>
        </table>
    </div>
    <ul>
        <li><strong>Numero rate</strong>: da 2 a 60.</li>
        <li><strong>Frequenza</strong>: settimanale / mensile / custom (giorni).</li>
        <li><strong>Resto sulla prima rata</strong>: se la divisione non è esatta (es. €100 / 3), il centesimo in più finisce sulla prima rata.</li>
        <li><strong>Calcolo lato client</strong>: vedi l'anteprima di ogni rata prima di confermare.</li>
        <li>Le rate appaiono come <strong>spese separate</strong> nella lista, ognuna con la sua data.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── OCR ───────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[15])}    <p class="wiki-section-lead">Scatta una foto allo scontrino, l'app estrae <strong>data e importo</strong> più probabili e precompila il form. Tutto avviene <strong>nel tuo browser</strong> — l'immagine non lascia il dispositivo.</p>
    <ol>
        <li>In <code>/expenses</code>, clicca "Scansiona scontrino" nel form di creazione.</li>
        <li>Su mobile si apre direttamente la fotocamera (<code>capture=environment</code>); su desktop il file picker.</li>
        <li><strong>Tesseract.js</strong> (lingue ita+eng) viene caricato in lazy load da CDN la prima volta.</li>
        <li>Vengono estratti:
            <ul>
                <li><strong>Importo</strong>: il numero più grande nel formato <code>X[.,]XX</code>.</li>
                <li><strong>Data</strong>: pattern <code>DD/MM/YYYY</code> o <code>YYYY-MM-DD</code>.</li>
            </ul>
        </li>
        <li>I campi vengono precompilati; tu correggi se serve e salvi.</li>
    </ol>
    <div class="wiki-warn"><i class="bi bi-exclamation-triangle"></i><div>L'OCR funziona meglio su scontrini ben illuminati e ad alta risoluzione. Su foto sfocate o stropicciate, controlla sempre i campi prima di salvare.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── IMPORT CSV ── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[16])}    <p class="wiki-section-lead">Sia <code>/expenses</code> sia <code>/incomes</code> permettono <strong>import/export CSV</strong> con un formato semplice e tollerante.</p>
    <p><strong>Formato:</strong></p>
    <pre class="bg-body-tertiary p-2 rounded small"><code>Data;Categoria;Descrizione;Importo;Pagamento
05/05/2026;Spesa;Esselunga;47,80;Carta
04/05/2026;Ristorante;Pranzo Lucia;28.00;Contanti</code></pre>
    <ul>
        <li><strong>Encoding</strong>: UTF-8 con BOM (compatibile Excel italiano).</li>
        <li><strong>Separatore</strong>: punto e virgola <code>;</code>.</li>
        <li><strong>Date</strong>: accetta sia <code>DD/MM/YYYY</code> sia <code>YYYY-MM-DD</code>.</li>
        <li><strong>Decimali</strong>: accetta sia virgola sia punto.</li>
        <li><strong>Categorie</strong>: se la categoria non esiste, viene <strong>creata automaticamente</strong> (con colore e icona di default).</li>
        <li><strong>Etichette pagamento</strong>: tolleranti alle varianti italiane (Carta, Contanti, Bonifico, …).</li>
        <li><strong>Export</strong>: il CSV scaricato rispetta i filtri attivi → puoi esportare un sottoinsieme.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── IMPORT BANK ─ -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[17])}    <p class="wiki-section-lead">Importa un estratto conto CSV (formato <strong>Banca Sella / Patavina</strong>) e my-expense crea spese, entrate e trasferimenti riconoscendo le tipologie di operazione.</p>
    <ol>
        <li>Su <code>/expenses</code> clicca "Estratto conto".</li>
        <li>Scegli il file CSV.</li>
        <li><strong>Seleziona il conto</strong> di destinazione (obbligatorio).</li>
        <li>Conferma l'opzione "Partita doppia su ricariche prepagate" (default ON).</li>
        <li>Vedi l'anteprima e confermi.</li>
    </ol>
    <p><strong>Cosa fa il parser:</strong></p>
    <ul>
        <li><strong>Encoding</strong>: rileva e converte automaticamente Windows-1252 → UTF-8.</li>
        <li>Cerca l'header <code>Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate</code> saltando i metadata di intestazione.</li>
        <li>Per ogni riga: importo in <code>Uscite</code> → spesa, importo in <code>Entrate</code> → entrata.</li>
        <li><strong>Mapping MCC</strong>: codici esercente comuni (5411 = Spesa alimentare, 5812/5814 = Ristorazione, 5912 = Farmacia, 5541/5542 = Carburante, 7941 = Sport…) producono la categoria giusta.</li>
        <li><strong>Sorgente entrata</strong>: dal testo descrizione viene dedotto (es. "Stipendio", "Bonifico da Mario", "P2P").</li>
    </ul>
    <details><summary>Partita doppia su ricariche carta prepagata</summary><div>
        Le righe del tipo <code>RICARICA / RIMBORSO CARTA/E PREPAGATA/E</code> generano <strong>due movimenti</strong>:
        <ul class="mb-0">
            <li>una <em>spesa</em> sul conto sorgente (con causale automatica);</li>
            <li>una <em>entrata</em> sul conto "Carta Prepagata" (auto-creato se non esiste).</li>
        </ul>
        In questo modo il bilancio totale resta invariato ma puoi vedere correttamente i saldi separati per ciascun conto. La commissione di 1€ della ricarica resta una spesa normale nella categoria "Commissioni bancarie".
    </div></details>
    <details><summary>Idempotenza del re-import</summary><div>
        Ogni riga importata calcola un <code>import_hash</code> SHA-256 dei suoi dati salienti. Se reimporti lo stesso file, le righe già presenti vengono <strong>saltate</strong> e contate come <code>skipped_duplicate</code>. Puoi quindi reimportare senza paura di duplicare.
    </div></details>
    <div class="wiki-tip"><i class="bi bi-calendar-event"></i><div>Per ogni riga vengono salvate due date: <code>data operazione</code> (quando hai pagato) e <code>data valuta</code> (quando la banca ha contabilizzato). I filtri usano la data operazione di default.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── BACKUP ────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[18])}    <p class="wiki-section-lead">Scarica un <strong>backup ZIP completo</strong> dei tuoi dati con un click. Contiene un dump SQL di tutte le tabelle (filtrate sul tuo utente) + la cartella degli allegati.</p>
    <ul>
        <li>Bottone <i class="bi bi-cloud-download"></i> <strong>Backup ZIP</strong> nel menu utente, oppure URL diretto <code>/backup/download</code>.</li>
        <li>Il file scaricato contiene:
            <ul>
                <li><code>dump.sql</code> con INSERT statements (compatibile con MySQL/MariaDB).</li>
                <li><code>uploads/{user_id}/</code> con tutti gli allegati delle spese.</li>
            </ul>
        </li>
        <li><strong>Restore</strong>: la pagina <code>/settings</code> ha la tab "Ripristina backup". Carica il file, digita la frase di conferma + password.</li>
        <li><strong>Fallback</strong>: se l'estensione PHP <code>ZipArchive</code> non è disponibile, il download produce solo il file <code>.sql</code>.</li>
    </ul>
    <div class="wiki-tip"><i class="bi bi-shield-check"></i><div>Per buona pratica, scarica un backup <strong>prima</strong> di qualsiasi operazione potenzialmente distruttiva (reset DB, restore, import massivo).</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── RESET DB ──── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[19])}    <p class="wiki-section-lead">Cancellazione <strong>irreversibile</strong> dei tuoi dati. Pensato per chi vuole "ricominciare da zero" senza reinstallare l'app. Protetto da una sequenza di conferme.</p>
    <p><strong>Tre ambiti possibili:</strong></p>
    <ul>
        <li><strong>Solo movimenti</strong>: cancella spese, entrate, tag, allegati. Mantiene conti, categorie, budget, ricorrenti.</li>
        <li><strong>Movimenti + reset ricorrenti</strong>: come sopra + resetta <code>last_generated_date</code> sulle ricorrenti (così ricominciano dalla data di inizio).</li>
        <li><strong>Reset totale</strong>: tabula rasa di tutte le tabelle eccetto <code>users</code>. Mantieni solo il tuo account.</li>
    </ul>
    <p><strong>Per procedere devi:</strong></p>
    <ol>
        <li>Scaricare un <a href="#backup-restore">backup ZIP</a> (il bottone resta disabilitato finché non lo fai).</li>
        <li>Digitare la frase letterale <code>ELIMINA TUTTO</code> in maiuscolo.</li>
        <li>Reinserire la tua password.</li>
    </ol>
    <div class="wiki-warn"><i class="bi bi-exclamation-octagon"></i><div><strong>Operazione non annullabile.</strong> La cancellazione è in una singola transazione con <code>PRAGMA foreign_keys = OFF</code>; gli allegati su disco vengono rimossi best-effort dopo il commit. Senza backup, i dati sono persi per sempre.</div></div>
</section>

<!-- ──────────────────────────────────────────────────────────── PWA ───────── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[20])}    <p class="wiki-section-lead">my-expense è una <strong>Progressive Web App</strong>: la installi come fosse un'app nativa e funziona anche offline (sulle pagine già visitate).</p>
    <ul>
        <li><strong>Installazione</strong>: in Chrome / Edge clicca l'icona "Installa" nella barra indirizzi. Su iOS Safari: Condividi → Aggiungi a Home.</li>
        <li><strong>Service Worker</strong>: cache <em>cache-first</em> per gli asset CDN (Bootstrap, Chart.js, font), <em>network-first</em> per HTML e JSON. Quando sei offline vedi l'ultima versione cached delle pagine.</li>
        <li><strong>Icone</strong>: SVG con gradiente lilac→pesca e simbolo €, supporto maskable.</li>
        <li><strong>Theme color</strong>: <code>#9B7CD9</code> (lilac), visibile come colore della status bar su Android.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── DARK MODE ─── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[21])}    <p class="wiki-section-lead">Tre modalità di tema, scelta persistente nel browser (<code>localStorage[mx-theme]</code>).</p>
    <div class="mockup-pane d-flex gap-2 align-items-center justify-content-center">
        <div class="mx-theme-segments" role="group" aria-label="Esempio">
            <button type="button" class="mx-theme-btn active"><i class="bi bi-sun-fill"></i></button>
            <button type="button" class="mx-theme-btn"><i class="bi bi-moon-stars-fill"></i></button>
            <button type="button" class="mx-theme-btn"><i class="bi bi-circle-half"></i></button>
        </div>
        <span class="text-muted small ms-2">Chiaro · Scuro · Auto (segue il sistema)</span>
    </div>
    <ul>
        <li><strong>Chiaro</strong>: palette pastel su sfondo crema (<code>#FFF7F0</code>).</li>
        <li><strong>Scuro</strong>: palette pastel desaturata su sfondo deep navy (<code>#14122A</code>).</li>
        <li><strong>Auto</strong>: rispetta <code>prefers-color-scheme</code> del sistema operativo, reagisce al cambio in tempo reale.</li>
        <li>Il tema viene applicato <strong>nel <code>&lt;head&gt;</code></strong> via uno script inline che legge il localStorage, così non c'è "flash" al caricamento (no FOUC).</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── SICUREZZA ─── -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[22])}    <p class="wiki-section-lead">my-expense gira <strong>completamente sul tuo computer</strong> (XAMPP: Apache + MySQL + PHP). Nessun dato esce mai dalla macchina.</p>
    <ul>
        <li><strong>Password</strong>: hashate con bcrypt (<code>PASSWORD_BCRYPT</code>), mai memorizzate in chiaro.</li>
        <li><strong>Sessione</strong>: cookie di sessione PHP, scadenza standard, <code>HttpOnly</code>.</li>
        <li><strong>CSRF</strong>: ogni form e ogni richiesta non-GET porta un token CSRF (campo <code>_csrf</code> nei form, header <code>X-CSRF-Token</code> dalle fetch). Doppio canale: hidden field + cookie.</li>
        <li><strong>Upload</strong>: gli allegati sono salvati fuori dalla docroot, accessibili solo via endpoint autenticato che verifica l'ownership; whitelist mime: jpg/png/gif/webp/pdf; max 8 MB.</li>
        <li><strong>Database</strong>: tutte le tabelle hanno colonna <code>user_id</code>; le query sono <strong>scoped</strong> sull'utente loggato — non puoi vedere i dati di un altro utente neanche conoscendo gli ID.</li>
        <li><strong>OCR</strong>: gira al 100% nel browser (Tesseract.js compilato in WebAssembly). Lo scontrino non viene mai inviato a un server.</li>
        <li><strong>Service Worker</strong>: cache solo dei tuoi asset; nessuna telemetria.</li>
    </ul>
</section>

<!-- ──────────────────────────────────────────────────────────── SCORCIATOIE ─ -->
<section class="wiki-section" data-wiki-section>
    ${intestazione(SEZIONI[23])}    <p class="wiki-section-lead">Riferimento rapido a formati, soglie e nomi che torna utile in giro.</p>

    <h5 class="mt-3"><i class="bi bi-keyboard me-2"></i>Tasti</h5>
    <ul>
        <li><span class="wiki-kbd">Tab</span> sposta il focus tra i campi del form; <span class="wiki-kbd">Enter</span> nei form inline conferma il salvataggio.</li>
        <li><span class="wiki-kbd">Esc</span> chiude i modal aperti.</li>
        <li>Nella barra di ricerca di questa guida: digita e vedrai filtrare in tempo reale.</li>
    </ul>

    <h5 class="mt-3"><i class="bi bi-filetype-csv me-2"></i>Formati CSV</h5>
    <ul>
        <li><strong>Spese / Entrate</strong> (CSV semplice): <code>Data;Categoria;Descrizione;Importo;Pagamento</code> · UTF-8 BOM · separatore <code>;</code>.</li>
        <li><strong>Estratto conto bancario</strong>: header <code>Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate</code> · encoding Windows-1252 auto-convertito.</li>
    </ul>

    <h5 class="mt-3"><i class="bi bi-bullseye me-2"></i>Soglie budget</h5>
    <ul>
        <li>≥ 80% → toast warning, colore giallo.</li>
        <li>≥ 100% → toast error, colore rosso.</li>
    </ul>

    <h5 class="mt-3"><i class="bi bi-receipt-cutoff me-2"></i>Codici MCC più frequenti</h5>
    <ul class="row row-cols-1 row-cols-md-2 g-1">
        <li class="col"><code>5411</code> Spesa alimentare</li>
        <li class="col"><code>5812</code> / <code>5814</code> Ristorazione</li>
        <li class="col"><code>5912</code> Farmacia</li>
        <li class="col"><code>5541</code> / <code>5542</code> Carburante</li>
        <li class="col"><code>7941</code> Sport</li>
        <li class="col"><code>5311</code> Grandi magazzini</li>
    </ul>

    <h5 class="mt-3"><i class="bi bi-paperclip me-2"></i>Allegati spese</h5>
    <ul>
        <li>Formati ammessi: <code>jpg</code>, <code>jpeg</code>, <code>png</code>, <code>gif</code>, <code>webp</code>, <code>pdf</code>.</li>
        <li>Dimensione massima: <strong>8 MB</strong> per file.</li>
    </ul>
</section>

    </main>
</div>

<!-- Toast copy-link -->
<div class="wiki-copy-toast" id="wiki-copy-toast" role="status" aria-live="polite"><i class="bi bi-check2-circle me-2"></i>Link copiato</div>

<script type="module" src="${asset('js/wiki.js')}"></script>
`;
};
