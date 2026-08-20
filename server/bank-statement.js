/**
 * Lettura degli estratti conto Banca Sella / Patavina — traduce la parte di
 * analisi di App\BankStatementImporter, quella che non tocca il database.
 *
 * Il file arriva in Windows-1252 o UTF-8, con un blocco di intestazione prima
 * dei movimenti veri. Da ogni riga si ricava tipo, importo, categoria proposta
 * e possibile controparte.
 */

import { HttpError } from './http.js';

export const KIND_EXPENSE = 'expense';
export const KIND_INCOME = 'income';
export const KIND_TRANSFER_PAIR = 'transfer_pair';
export const KIND_ATM_PAIR = 'atm_pair';

/** Codice attivita' del commerciante (MCC) -> categoria proposta. */
const MCC_MAP = {
  5411: 'Spesa', 5499: 'Distributori automatici', 5541: 'Carburante', 5542: 'Carburante',
  5655: 'Abbigliamento', 5691: 'Abbigliamento', 5812: 'Ristorazione', 5814: 'Ristorazione',
  5912: 'Farmacia', 5942: 'Tempo libero', 5945: 'Tempo libero', 5946: 'Ottica',
  5977: 'Tempo libero', 5309: 'Bar', 7011: 'Hotel', 7230: 'Cura persona',
  7311: 'Servizi', 7512: 'Auto', 7523: 'Auto', 7531: 'Auto', 7832: 'Tempo libero',
  7941: 'Sport', 7991: 'Tempo libero', 8021: 'Salute', 8062: 'Salute', 8071: 'Salute',
  8099: 'Salute', 8299: 'Formazione', 4111: 'Trasporti', 4131: 'Trasporti',
  4789: 'Trasporti', '0742': 'Veterinario',
};

/**
 * Decodifica il file. Se non e' UTF-8 valido si assume Windows-1252, che e'
 * quello che producono i gestionali bancari italiani.
 */
export function loadAndDecode(buffer) {
  let raw = buffer;
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) raw = raw.subarray(3);

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(raw);
  // Il carattere di sostituzione tradisce byte non validi in UTF-8.
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(raw);
}

export function findHeaderRow(lines) {
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (low.includes('operazione') && low.includes('valuta')
        && (low.includes('uscite') || low.includes('entrate'))) {
      return i;
    }
  }
  return null;
}

export function extractIban(lines) {
  for (const line of lines) {
    const m = line.match(/(IT\d{2}[A-Z]\d{22})/);
    if (m) return m[1];
  }
  return null;
}

/** Le date della banca sono gg/mm/aaaa, a volte con l'anno a due cifre. */
export function parseItDate(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') throw HttpError.badRequest('Data mancante.');

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3].padStart(4, '0')}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const anno = Number(m[3]) >= 70 ? 1900 + Number(m[3]) : 2000 + Number(m[3]);
    return `${anno}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  }
  throw HttpError.badRequest(`Data non valida: '${s}'.`);
}

/** Importi con separatore delle migliaia, simbolo di valuta, segno. */
export function parseBankAmount(raw) {
  let clean = String(raw ?? '').replace(/[€ \s]/g, '').replace(/EUR|€/g, '').trim();
  if (clean === '') throw HttpError.badRequest('Importo vuoto.');

  let negative = false;
  if (clean.startsWith('-')) { negative = true; clean = clean.slice(1); }
  else if (clean.startsWith('+')) clean = clean.slice(1);

  const hasDot = clean.includes('.');
  const hasComma = clean.includes(',');
  if (hasDot && hasComma) clean = clean.replace(/\./g, '').replace(',', '.');
  else if (hasComma) clean = clean.replace(',', '.');

  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(clean)) throw HttpError.badRequest(`Importo non valido: '${raw}'.`);
  const val = Number(clean);
  return negative ? Math.abs(val) : val;
}

export function isAtmWithdrawalDescription(desc) {
  const s = String(desc ?? '');
  if (/PRELIEVO DI CONTANTE/i.test(s)) return true;
  if (/PRELIEVI PAESI/i.test(s)) return true;
  return /\bCOD\.\s*MCC\s*6011\b/i.test(s);
}

export function classifyExpense(tipologia, descrizione) {
  const t = String(tipologia ?? '').toLowerCase();

  if (t.includes('stipendi')) return 'Trasferimenti';
  if (t.includes('bonifici')) return 'Bonifici';
  if (t.includes('bancomat pay')) return 'P2P';
  if (t.includes('addebiti diretti')) {
    return /AMAZON/i.test(descrizione) ? 'Acquisti online' : 'Addebiti SDD';
  }
  if (t.includes('bollettini')) return 'Utenze';
  // Le commissioni della ricarica restano una spesa normale.
  if (t.includes('ricariche')) return 'Commissioni bancarie';

  const mcc = String(descrizione ?? '').match(/COD\.\s*MCC\s*(\d{4})/i);
  if (mcc && MCC_MAP[mcc[1]]) return MCC_MAP[mcc[1]];

  if (isAtmWithdrawalDescription(descrizione)) return 'Prelievo contante';
  return 'Pagamenti';
}

export function classifyIncomeSource(tipologia, descrizione) {
  const t = String(tipologia ?? '').toLowerCase();
  if (t.includes('stipendi')) return 'Stipendio';
  if (t.includes('bancomat pay')) return 'P2P';
  if (t.includes('bonifici')) {
    const nome = extractCounterparty(tipologia, descrizione, 'income');
    return nome !== null ? `Bonifico da ${nome}` : 'Bonifico';
  }
  return 'Entrata';
}

/** Ripulisce il nome estratto: spazi, codici in coda, iniziali maiuscole. */
export function cleanupCounterpartyName(raw) {
  let s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  s = s.replace(/\s+\d{6,}.*$/, '');
  s = s.replace(/^[\s.,']+|[\s.,']+$/g, '');
  if (s === '' || [...s].length < 3) return null;
  if ([...s].length > 120) s = [...s].slice(0, 120).join('');
  return s.toLowerCase().replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());
}

/**
 * Cerca il nome della controparte nella descrizione. Le banche non hanno un
 * campo dedicato: il nome va pescato dai formati ricorrenti, e quando non si
 * riconosce niente e' meglio nessun nome che uno sbagliato.
 */
export function extractCounterparty(tipologia, descrizione, kind) {
  const desc = String(descrizione ?? '').trim();
  if (desc === '') return null;

  // "A FAV. MARIO ROSSI BONIFICO ..." — vale per entrambi i versi.
  let m = desc.match(/\bFAV\.\s+([A-Z][A-Z\s.']+?)\s+BONIFICO\b/u);
  if (m) return cleanupCounterpartyName(m[1]);

  // "SEPA ISTANTANEO MARIO ROSSI VAL. ..."
  m = desc.match(/\bSEPA\s+(?:ISTANTANEO|ORDINARIO)\s+([A-Z][A-Z\s.']+?)\s+VAL\./u);
  if (m) return cleanupCounterpartyName(m[1]);

  if (kind === 'income') {
    m = desc.match(
      /\b(?:VS\.?\s*FAVORE|A\s+FAVORE\s+DI|VOSTRA\s+DISPOSIZIONE|DA)\s+([A-Z][A-Z\s.']+?)(?:\s+VAL\.|\s+COD\.|\s+CRO|\s+NOTE:|\s+DATA|\s+IT\d{2}|$)/u,
    );
    return m ? cleanupCounterpartyName(m[1]) : null;
  }

  const t = String(tipologia ?? '').toLowerCase();

  // Nei prelievi il "C/O ..." e' il gestore dello sportello, non un fornitore.
  if (isAtmWithdrawalDescription(desc)) return null;

  if (t.includes('bonifici')) {
    m = desc.match(/\bA\s+([A-Z][A-Z\s.']+?)(?:\s+NOTE:|\s+VAL\.|\s+CRO|\s+DATA|$)/u);
    if (m) return cleanupCounterpartyName(m[1]);
  }

  m = desc.match(/^ADDEBITO\s+SDD\s+(.+?)(?:\s+VAL\.|\s+COD\.|\s+RIF\.|\s+MANDATO|$)/i);
  if (m) return cleanupCounterpartyName(m[1]);

  // Il negozio viene dopo "C/O" e finisce al primo termine tipico
  // dell'estratto conto, a un indirizzo o a una cifra.
  m = desc.match(
    /\bC\/O\s+([A-Z][A-Z0-9\s.']+?)(?:\s+(?:DEL|VAL|COD|CRO|NOTE|DATA|IL|IN|VIA|VIALE|PIAZZA|CORSO|LARGO|VICOLO|GALLERIA)\b|\s+\d|$)/u,
  );
  if (m) return cleanupCounterpartyName(m[1]);

  if (/\bAMAZON(?:\.IT|\s+EU|\.COM|\*MARK\w*|\s+MARKET\w*)?\b/i.test(desc)) return 'Amazon';

  m = desc.match(/\bPAGAMENTO\s+POS\s+(.+?)\s+COD\.\s*MCC/i) ?? desc.match(/\bPOS\s+(.+?)\s+COD\.\s*MCC/i);
  if (m) return cleanupCounterpartyName(m[1]);

  m = desc.match(/\bBOLLETTIN[OI]\s+(?:POSTALE\s+|BANCARIO\s+)?(.+?)(?:\s+CRO|\s+VAL\.|$)/i);
  if (m) {
    const candidato = cleanupCounterpartyName(m[1]);
    if (candidato !== null) return candidato;
  }

  // Movimenti interni e oneri bancari non hanno una controparte.
  if (/RICARICA/i.test(desc) || /RIMBORSO CARTA/i.test(desc)) return null;
  if (/COMMISSIONE/i.test(desc) || /IMPOSTA DI BOLLO/i.test(desc)) return null;

  m = desc.match(/\b([A-Z][A-Z.']{3,}(?:\s+[A-Z][A-Z.']+){0,4})\b/u);
  return m ? cleanupCounterpartyName(m[1]) : null;
}

export function guessPaymentMethod(tipologia, descrizione) {
  const t = String(tipologia ?? '').toLowerCase();
  if (t.includes('bonifici') || t.includes('bollettini') || t.includes('addebiti diretti')
      || t.includes('bancomat pay') || t.includes('ricariche')) {
    return 'transfer';
  }
  if (/PRELIEVO DI CONTANTE/i.test(descrizione)) return 'cash';
  return 'card';
}

export function guessIncomePaymentMethod(tipologia) {
  const t = String(tipologia ?? '').toLowerCase();
  if (t.includes('bancomat pay')) return 'card';
  if (t.includes('contante') || t.includes('cash')) return 'cash';
  return 'transfer';
}

/** Il nome normalizzato di un contatto, come Contact::normalize. */
export const normalizeName = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
