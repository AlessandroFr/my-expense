import { esc, each, asset, vuoto } from '../view.js';
import { AMOUNT_MODES, DATE_ORDERS, DELIMITERS, ENCODINGS, FIELDS, FIELD_LABELS } from '../bank-profiles.js';

const ETICHETTE_SEPARATORE = {
  auto: 'Riconoscilo da solo', ';': 'Punto e virgola  ;', ',': 'Virgola  ,', tab: 'Tabulazione', '|': 'Barra verticale  |',
};
const ETICHETTE_CODIFICA = {
  auto: 'Riconoscila da sola', 'utf-8': 'UTF-8', 'windows-1252': 'Windows-1252 (Excel italiano)',
};
const ETICHETTE_IMPORTO = {
  auto: 'Come è fatto il file', in_out: 'Due colonne: uscite ed entrate', signed: 'Una colonna sola, con il meno davanti alle uscite',
};
const ETICHETTE_DATE = {
  auto: 'Riconoscile da sole', dmy: 'Giorno/mese/anno', ymd: 'Anno-mese-giorno', mdy: 'Mese/giorno/anno',
};

const AIUTO_CAMPI = {
  op_date: 'obbligatoria',
  value_date: 'se la banca la esporta',
  tipologia: 'serve a proporre la categoria',
  description: 'più nomi = più colonne unite insieme',
  outflow: 'i soldi che escono',
  inflow: 'i soldi che entrano',
  amount: 'solo se la banca usa una colonna sola',
};

const opzioni = (valori, etichette, scelto) => valori.map((v) =>
  `<option value="${esc(v)}"${v === scelto ? ' selected' : ''}>${esc(etichette[v] ?? v)}</option>`).join('');

const colonneDi = (profilo) => {
  try { return JSON.parse(profilo?.columns_json ?? '{}'); } catch { return {}; }
};

/** Il form del profilo: identico per il nuovo e per la modifica. */
const form = (profilo) => {
  const cols = colonneDi(profilo);
  const nuovo = profilo === null;
  const id = nuovo ? 'new' : String(profilo.id);
  return `
<form class="row g-2 bank-profile-form" data-id="${nuovo ? '' : esc(id)}" autocomplete="off">
    <div class="col-12 col-md-6">
        <label class="form-label small fw-semibold" for="bp-name-${esc(id)}">Nome della banca</label>
        <input type="text" class="form-control form-control-sm" id="bp-name-${esc(id)}" name="name"
               maxlength="64" required value="${esc(profilo?.name ?? '')}" placeholder="es. Banca Mediolanum">
    </div>
    <div class="col-6 col-md-3">
        <label class="form-label small fw-semibold" for="bp-delim-${esc(id)}">Separatore delle colonne</label>
        <select class="form-select form-select-sm" id="bp-delim-${esc(id)}" name="delimiter">
            ${opzioni(DELIMITERS, ETICHETTE_SEPARATORE, profilo?.delimiter ?? 'auto')}
        </select>
    </div>
    <div class="col-6 col-md-3">
        <label class="form-label small fw-semibold" for="bp-enc-${esc(id)}">Codifica del testo</label>
        <select class="form-select form-select-sm" id="bp-enc-${esc(id)}" name="encoding">
            ${opzioni(ENCODINGS, ETICHETTE_CODIFICA, profilo?.encoding ?? 'auto')}
        </select>
    </div>
    <div class="col-12 col-md-5">
        <label class="form-label small fw-semibold" for="bp-mode-${esc(id)}">Come sono scritti gli importi</label>
        <select class="form-select form-select-sm" id="bp-mode-${esc(id)}" name="amount_mode">
            ${opzioni(AMOUNT_MODES, ETICHETTE_IMPORTO, profilo?.amount_mode ?? 'auto')}
        </select>
    </div>
    <div class="col-6 col-md-4">
        <label class="form-label small fw-semibold" for="bp-date-${esc(id)}">Come sono scritte le date</label>
        <select class="form-select form-select-sm" id="bp-date-${esc(id)}" name="date_order">
            ${opzioni(DATE_ORDERS, ETICHETTE_DATE, profilo?.date_order ?? 'auto')}
        </select>
    </div>
    <div class="col-6 col-md-3">
        <label class="form-label small fw-semibold" for="bp-sort-${esc(id)}">Ordine nell'elenco</label>
        <input type="number" class="form-control form-control-sm" id="bp-sort-${esc(id)}" name="sort_order"
               value="${esc(String(profilo?.sort_order ?? 500))}">
    </div>

    <div class="col-12">
        <hr class="my-2">
        <p class="small text-muted mb-2">
            Per ogni campo, scrivi come si chiama la colonna nel file della banca. Se i nomi
            possibili sono più di uno, separali con una virgola: verranno provati in ordine.
        </p>
        <div class="input-group input-group-sm mb-3">
            <span class="input-group-text">Riga di intestazione del file</span>
            <input type="text" class="form-control bp-header-paste"
                   placeholder="Incolla qui la prima riga del file, quella con i nomi delle colonne">
            <button type="button" class="btn btn-outline-secondary bp-header-fill">Compila i campi</button>
        </div>
    </div>

    ${FIELDS.map((f) => `        <div class="col-12 col-md-6 col-xl-4">
        <label class="form-label small fw-semibold" for="bp-${esc(f)}-${esc(id)}">
            ${esc(FIELD_LABELS[f])} <span class="text-muted fw-normal">(${esc(AIUTO_CAMPI[f])})</span>
        </label>
        <input type="text" class="form-control form-control-sm" id="bp-${esc(f)}-${esc(id)}"
               data-field="${esc(f)}" value="${esc((cols[f] ?? []).join(', '))}">
    </div>
    `).join('')}
    <div class="col-12">
        <label class="form-label small fw-semibold" for="bp-notes-${esc(id)}">Note</label>
        <input type="text" class="form-control form-control-sm" id="bp-notes-${esc(id)}" name="notes"
               maxlength="500" value="${esc(profilo?.notes ?? '')}">
    </div>

    <div class="col-12 d-flex gap-2 mt-3">
        <button type="submit" class="btn btn-primary btn-sm">
            <i class="bi bi-check-lg me-1"></i>${nuovo ? 'Crea profilo' : 'Salva'}
        </button>
        ${nuovo ? '' : (profilo.builtin_key
    ? `<button type="button" class="btn btn-outline-secondary btn-sm" data-action="reset">
            <i class="bi bi-arrow-counterclockwise me-1"></i>Rimetti com'era
        </button>`
    : `<button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">
            <i class="bi bi-trash me-1"></i>Elimina
        </button>`)}
    </div>
</form>`;
};

export const render = ({ profiles, genericColumns }) => `
<div class="row mb-3">
    <div class="col-12 d-flex justify-content-between align-items-center">
        <h1 class="h3 mb-0"><i class="bi bi-bank me-2"></i>Profili banca</h1>
        <a href="/expenses" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Torna alle spese
        </a>
    </div>
</div>

<div class="alert alert-light border small">
    Ogni banca esporta i movimenti con colonne sue. Qui c'è scritto, banca per banca,
    come si chiamano quelle colonne: quando importi un estratto conto, l'app confronta
    il file con questi profili e ti dice quale ha riconosciuto, prima di importare
    qualsiasi cosa.
    <br>
    <strong>Il profilo di Banca Sella è l'unico provato su file veri.</strong> Gli altri
    sono preparati sui nomi che quelle banche usano di solito: la prima volta che
    importi, controlla in anteprima che ogni colonna sia finita al posto giusto, e se
    qualcosa non torna correggi il profilo qui.
</div>

<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 text-muted mb-3"><i class="bi bi-plus-circle me-1"></i>Nuovo profilo</h2>
        ${form(null)}
    </div>
</div>

<div class="d-flex flex-column gap-2" id="bank-profiles-list">
${each(profiles, (p) => `    <details class="card shadow-sm" data-id="${p.id}">
        <summary class="card-body py-2 d-flex justify-content-between align-items-center" style="cursor:pointer">
            <span>
                <strong>${esc(p.name)}</strong>
                ${p.builtin_key ? '<span class="badge bg-secondary ms-2">preimpostato</span>' : ''}
                <span class="text-muted small ms-2">${esc(Object.keys(colonneDi(p)).length)} campi mappati</span>
            </span>
            <i class="bi bi-chevron-down text-muted"></i>
        </summary>
        <div class="card-body border-top pt-3">
            ${form(p)}
        </div>
    </details>
`)}</div>
${(vuoto(profiles)) ? `<div class="p-4 text-center text-muted">Nessun profilo. Creane uno qui sopra.</div>` : ``}

<script type="application/json" id="bank-profiles-generic">${JSON.stringify(genericColumns)}</script>
<script type="module" src="${asset('js/pages/bank-profiles.js')}"></script>
`;
