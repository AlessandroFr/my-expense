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
