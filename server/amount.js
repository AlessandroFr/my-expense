/**
 * Lettura degli importi dai campi di testo, identica a quella di PHP.
 *
 * PHP fa `(float) str_replace(',', '.', $v)`. Sul formato italiano completo
 * "1.234,56" questo produce "1.234.56", che (float) tronca a 1.234: il
 * separatore delle migliaia non e' gestito. Il comportamento e' discutibile,
 * ma va riprodotto tale e quale finche' i due backend convivono, altrimenti lo
 * stesso valore verrebbe salvato in modo diverso a seconda di chi risponde.
 *
 * ponytail: quando PHP sara' sparito si potra' decidere di gestire davvero il
 * separatore delle migliaia — e' un cambio di comportamento, non una pulizia.
 */
export function parseAmountLikePhp(value) {
  const n = Number.parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Un importo scritto all'italiana, **con** il separatore delle migliaia:
 * "1.234,56" fa 1234,56 e non 1,234.
 *
 * Sta accanto a `parseAmountLikePhp` invece di sostituirla perche' sono due
 * cose diverse: quella riproduce come sono stati letti i dati che ci sono gia'
 * e non va toccata, questa serve ai campi nuovi, dove non c'e' niente di
 * vecchio da rispettare e leggere 1.234,50 come «uno e ventitre» sarebbe solo
 * un errore. Il primo campo cosi' e' il saldo iniziale nella procedura di
 * benvenuto: una persona che comincia scrive il saldo come lo legge in banca.
 */
export function parseAmountItaliano(value) {
  const grezzo = String(value ?? '').trim().replace(/[\s €]/g, '');
  if (!grezzo) return 0;

  // L'ultimo separatore e' quello dei decimali; gli altri sono migliaia. Vale
  // sia per "1.234,56" sia per "1,234.56", senza dover indovinare la lingua.
  const ultimoSep = Math.max(grezzo.lastIndexOf(','), grezzo.lastIndexOf('.'));
  const decimali = ultimoSep >= 0 && grezzo.length - ultimoSep - 1 <= 2
    ? grezzo.slice(ultimoSep + 1)
    : '';
  const intera = (decimali ? grezzo.slice(0, ultimoSep) : grezzo).replace(/[.,]/g, '');

  const n = Number.parseFloat(`${intera}${decimali ? `.${decimali}` : ''}`);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Arrotonda come round() di PHP.
 *
 * Math.round(x * 100) / 100 non basta: 263.585 * 100 in virgola mobile fa
 * 26358.499999999996, quindi JS arrotonda per difetto (263.58) dove PHP
 * arrotonda per eccesso (263.59). PHP compensa l'errore di rappresentazione
 * prima di arrotondare, e qui si ottiene lo stesso spostando la virgola sulla
 * *stringa* invece che moltiplicando.
 *
 * La differenza si vede solo quando il valore cade esattamente a meta', ma su
 * dati veri e' successo al primo confronto: la media mensile di un anno.
 */
export function roundLikePhp(value, precision = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const shifted = Number(`${n}e${precision}`);
  if (!Number.isFinite(shifted)) return n;
  const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted));
  return Number(`${rounded}e${-precision}`);
}

/**
 * Un importo come lo vuole il frontend: stringa con due decimali, o null.
 * Come number_format($v, 2, '.', '') di PHP, che e' quello che leggeva prima.
 */
export const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));
