// Come una spesa sola si divide fra piu' piani di accumulo.
//
// Sull'estratto conto un versamento e' una riga sola: 500 euro il 5 del mese.
// Dentro, quei 500 sono cinque quote da 100 su cinque fondi diversi. Qui c'e'
// solo il conto della divisione — chi la usa (routes/pac.js per marcare una
// spesa, routes/bank-import.js per proporla in anteprima) ci mette intorno il
// database.

import { parseAmountLikePhp, roundLikePhp } from './amount.js';

/**
 * Le quote come le manda l'interfaccia: piano + importo, in qualsiasi ordine.
 * Le quote a zero spariscono (e' il modo in cui si toglie un piano dalla
 * divisione senza inventare un altro campo), e lo stesso piano non puo'
 * comparire due volte.
 */
export function normalizeShares(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const visti = new Set();
  for (const q of raw) {
    const planId = Number.parseInt(q?.plan_id, 10);
    if (!Number.isInteger(planId) || planId <= 0) continue;
    const amount = roundLikePhp(parseAmountLikePhp(q?.amount));
    if (amount <= 0) continue;
    if (visti.has(planId)) throw new Error('Lo stesso piano compare due volte nella divisione.');
    visti.add(planId);
    out.push({ plan_id: planId, amount });
  }
  return out;
}

/**
 * La somma delle quote deve fare l'importo della spesa: al centesimo, senza
 * "quasi". Se non torna, il messaggio dice di quanto — cercare la differenza a
 * mano fra cinque righe non e' il mestiere di chi sta importando l'estratto.
 */
export function sharesMismatch(shares, total) {
  const somma = roundLikePhp(shares.reduce((s, q) => s + q.amount, 0));
  const atteso = roundLikePhp(total);
  if (somma === atteso) return null;
  const diff = roundLikePhp(atteso - somma);
  return diff > 0
    ? `Mancano ${diff.toFixed(2)} euro: le quote fanno ${somma.toFixed(2)} su ${atteso.toFixed(2)}.`
    : `Ci sono ${(-diff).toFixed(2)} euro di troppo: le quote fanno ${somma.toFixed(2)} su ${atteso.toFixed(2)}.`;
}

/**
 * La divisione da proporre in anteprima, o null se non c'e' niente di ovvio da
 * proporre.
 *
 * Si parte dai piani il cui riferimento compare nella descrizione del
 * movimento; se non ne parla nessuno, si considerano tutti. Poi la proposta
 * arriva solo se gli importi previsti dai piani fanno esattamente quello del
 * movimento: senza quella coincidenza qualunque divisione sarebbe inventata, e
 * un numero inventato in mezzo a dei soldi e' peggio di nessun numero.
 */
export function suggestShares(plans, amount, description) {
  const desc = String(description ?? '').toLowerCase();
  const conKeyword = plans.filter((p) => {
    const k = String(p.beneficiary_keyword ?? '').trim().toLowerCase();
    return k !== '' && desc.includes(k);
  });
  const candidati = conKeyword.length > 0 ? conKeyword : plans;
  if (candidati.length === 0) return null;

  const shares = candidati.map((p) => ({ plan_id: p.id, amount: roundLikePhp(Number(p.amount)) }));
  return sharesMismatch(shares, amount) === null ? shares : null;
}
