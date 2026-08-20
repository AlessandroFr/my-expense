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
