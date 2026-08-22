// ─── modal-guard.js ──────────────────────────────────────────────────────────
// Nessuna finestra si chiude per sbaglio, e quel che stavi scrivendo non si
// perde comunque.
//
// Due cose, per tutte le finestre dell'applicazione — quelle di Bootstrap e
// quelle native `<dialog>`:
//
//  1. si chiudono solo con un bottone. Un clic fuori non fa niente (le
//     Bootstrap hanno `data-bs-backdrop="static"` nel markup, le native non lo
//     facevano gia'), e nemmeno Esc.
//  2. se una finestra si chiude lo stesso — il bottone Annulla premuto per
//     sbaglio, un salvataggio andato male — quel che c'era scritto viene
//     ripreso alla riapertura, purche' sia la stessa cosa che si stava
//     modificando.
//
// Il modulo si carica da solo su ogni pagina (view.js) e non va chiamato: si
// attacca agli eventi che gia' esistono, cosi' le pagine non sanno che c'e'.

import { toast } from './toast.js';

/** Quel che l'utente aveva scritto, per finestra e per record. */
const drafts = new Map();

/** Campi che non ha senso conservare: token, file, bottoni. */
const DA_SALTARE = new Set(['_csrf', 'submit', 'button', 'reset', 'file']);

const formDi = (modale) => modale?.querySelector('form') ?? null;

/**
 * L'identita' di quel che si sta modificando: la finestra piu' il record.
 * Senza il record, riaprire la scheda di un'altra spesa rimetterebbe dentro
 * i dati della precedente.
 */
function key(modale, form) {
  const id = form?.elements?.id?.value ?? '';
  return `${modale.id}|${id}`;
}

function readForm(form) {
  const values = {};
  for (const field of form.elements) {
    const name = field.name;
    if (!name || DA_SALTARE.has(name) || DA_SALTARE.has(field.type)) continue;
    if (field.dataset.noRestore !== undefined) continue;
    if (field.type === 'checkbox' || field.type === 'radio') {
      values[`${name}:${field.value}`] = field.checked;
    } else {
      values[name] = field.value;
    }
  }
  return values;
}

function writeForm(form, values) {
  for (const field of form.elements) {
    const name = field.name;
    if (!name) continue;
    let cambiato = false;
    if (field.type === 'checkbox' || field.type === 'radio') {
      const v = values[`${name}:${field.value}`];
      if (v !== undefined && field.checked !== v) { field.checked = v; cambiato = true; }
    } else if (values[name] !== undefined && field.value !== values[name]) {
      field.value = values[name];
      cambiato = true;
    }
    // Le pagine reagiscono ai campi con `change` (il tipo di conto mostra o
    // nasconde la cassa, la categoria ridisegna…): senza avvisarle il modulo
    // rimetterebbe i valori lasciando l'interfaccia com'era.
    if (cambiato) field.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

const sameValues = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isEmpty = (v) => Object.values(v).every((x) => x === '' || x === false);

/** Chiusa la finestra: se c'era qualcosa di scritto, se lo tiene da parte. */
function alleChiusura(modale) {
  const form = formDi(modale);
  if (!form) return;

  const k = key(modale, form);
  // Salvata: non c'e' piu' niente da riprendere, e riprenderlo darebbe una
  // scheda nuova gia' compilata con la roba di prima.
  if (form.dataset.mxSalvato !== undefined) {
    delete form.dataset.mxSalvato;
    drafts.delete(k);
    return;
  }

  const values = readForm(form);
  if (isEmpty(values)) drafts.delete(k);
  else drafts.set(k, values);
}

/**
 * Riaperta: quel che l'utente aveva scritto vince su quel che la pagina ha
 * appena messo dentro, ma solo se e' diverso — cosi' riaprire una scheda
 * appena salvata non fa comparire nessun messaggio.
 */
function allApertura(modale) {
  const form = formDi(modale);
  if (!form) return;

  const k = key(modale, form);
  const saved = drafts.get(k);
  if (!saved) return;

  if (sameValues(saved, readForm(form))) { drafts.delete(k); return; }
  writeForm(form, saved);
  drafts.delete(k);
  toast.info('Ho rimesso quello che stavi scrivendo.');
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
// I suoi eventi salgono fino a document: basta ascoltarli una volta sola.
document.addEventListener('hide.bs.modal', (ev) => alleChiusura(ev.target));
document.addEventListener('shown.bs.modal', (ev) => allApertura(ev.target));

// ── <dialog> native ──────────────────────────────────────────────────────────
// `close` e `cancel` non salgono: si ascoltano in cattura.
document.addEventListener('close', (ev) => {
  if (ev.target instanceof HTMLDialogElement) alleChiusura(ev.target);
}, true);

// Esc: una finestra si chiude col suo bottone, non per un tasto sfiorato.
document.addEventListener('cancel', (ev) => {
  if (ev.target instanceof HTMLDialogElement) ev.preventDefault();
}, true);

// Un clic sullo sfondo di una `<dialog>` arriva alla dialog stessa: fermarlo
// qui evita che una pagina lo interpreti come «chiudi».
document.addEventListener('click', (ev) => {
  if (ev.target instanceof HTMLDialogElement && ev.target.open) ev.stopPropagation();
}, true);

// L'apertura di una `<dialog>` non ha un evento: si passa da qui.
const apri = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function showModalConRipresa(...args) {
  apri.apply(this, args);
  allApertura(this);
};

// ── Salvataggi ───────────────────────────────────────────────────────────────
// Chi invia il form non ha piu' niente da riprendere; se pero' torna a
// scriverci dentro (salvataggio fallito) il segno si toglie e si riparte.
document.addEventListener('submit', (ev) => {
  const form = ev.target;
  if (form instanceof HTMLFormElement) form.dataset.mxSalvato = '1';
}, true);

document.addEventListener('input', (ev) => {
  const form = ev.target?.form;
  if (form) delete form.dataset.mxSalvato;
}, true);
