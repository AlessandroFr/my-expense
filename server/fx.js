/**
 * I cambi, e il controvalore di un movimento nella valuta principale.
 *
 * Due regole, e vengono dai soldi, non dal codice:
 *
 * **La valuta di un movimento è quella del suo conto.** Un conto in franchi
 * produce spese in franchi. Non serve una colonna per riga — e nessun estratto
 * conto la fornisce.
 *
 * **Il controvalore si congela alla data del movimento** (`amount_base`),
 * calcolato una volta sola quando si salva. Un report del 2025 non deve
 * cambiare perché oggi il cambio si è mosso: quei soldi, quel giorno, valevano
 * quello. È anche la scelta che tiene in piedi tutte le somme già scritte, che
 * restano somme di una colonna sola.
 *
 * I cambi sono **sempre contro EUR**, che fa da perno: è come li pubblica ogni
 * fonte, e le altre coppie si ricavano per triangolazione. `rate` = quante
 * unità di `quote` per 1 EUR.
 */

import { all, one, run } from './db.js';
import { HttpError } from './http.js';
import { roundLikePhp } from './amount.js';

export const PERNO = 'EUR';

/**
 * L'importo di un movimento nella valuta principale, da usare dentro le somme.
 *
 * Il vuoto vale come l'importo: un conto nella valuta principale non ha nessun
 * controvalore da scrivere, e cosi' un'installazione tutta in euro continua a
 * sommare esattamente la colonna che sommava prima. Vale anche per i movimenti
 * in valuta di cui manca il cambio: contano per quello che c'e' scritto, che e'
 * sbagliato ma visibile — meglio di una riga che sparisce dai totali.
 *
 * @param {string} alias il prefisso della tabella nella query ('e', 'x', '')
 */
export const inBase = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `COALESCE(${p}amount_base, ${p}amount)`;
};

/** La valuta principale scelta dall'utente. */
export const valutaPrincipale = (userId) =>
  one('SELECT base_currency FROM users WHERE id = ?', userId)?.base_currency ?? PERNO;

/** La valuta di un conto. */
export const valutaConto = (userId, accountId) => (accountId
  ? one('SELECT currency FROM accounts WHERE id = ? AND user_id = ?', accountId, userId)?.currency ?? PERNO
  : PERNO);

/**
 * Il cambio di una valuta a una certa data.
 *
 * Si prende quello **del giorno o del più vicino giorno precedente**: è il
 * cambio che quel giorno era noto. Se non c'è niente prima — un movimento più
 * vecchio del primo cambio inserito — si ripiega sul più vicino successivo,
 * perché un valore approssimato con la sua data scritta accanto vale più di un
 * buco. Se non c'è proprio niente, `null`: non si inventa.
 *
 * @returns {{rate: number, rate_date: string}|null}
 */
export function rateOn(userId, quote, date) {
  if (quote === PERNO) return { rate: 1, rate_date: date };

  const prima = one(
    `SELECT rate, rate_date FROM exchange_rates
     WHERE user_id = ? AND quote = ? AND rate_date <= ?
     ORDER BY rate_date DESC LIMIT 1`, userId, quote, date,
  );
  if (prima) return prima;

  return one(
    `SELECT rate, rate_date FROM exchange_rates
     WHERE user_id = ? AND quote = ? AND rate_date > ?
     ORDER BY rate_date ASC LIMIT 1`, userId, quote, date,
  );
}

/**
 * Converte un importo da una valuta a un'altra, al cambio di una certa data.
 *
 * @returns {{amount: number, rate: number, rate_date: string}}
 * @throws {HttpError} se manca il cambio: meglio un errore che un numero finto
 */
export function convert(userId, amount, da, a, date) {
  if (da === a) return { amount: roundLikePhp(amount), rate: 1, rate_date: date };

  const daPerno = rateOn(userId, da, date);
  const aPerno = rateOn(userId, a, date);

  for (const [valuta, cambio] of [[da, daPerno], [a, aPerno]]) {
    if (!cambio) {
      throw HttpError.badRequest(
        `Non c'è ancora nessun cambio per ${valuta}. `
        + 'Aggiungilo in Impostazioni → Cambi, poi riprova.',
      );
    }
  }
  if (!Number(daPerno.rate)) {
    throw HttpError.badRequest(`Il cambio di ${da} al ${daPerno.rate_date} è zero: correggilo.`);
  }

  return {
    amount: roundLikePhp((Number(amount) * Number(aPerno.rate)) / Number(daPerno.rate)),
    // La data più lontana delle due: è quella che dice quanto è vecchia la
    // conversione, e chi legge deve saperlo.
    rate: roundLikePhp(Number(aPerno.rate) / Number(daPerno.rate), 6),
    rate_date: daPerno.rate_date < aPerno.rate_date ? daPerno.rate_date : aPerno.rate_date,
  };
}

/**
 * Il controvalore di un importo nella valuta principale, da scrivere in
 * `amount_base` insieme al movimento.
 *
 * Il caso normale — conto nella valuta principale — non tocca il database e non
 * tocca la rete: un'installazione tutta in euro non passa mai di qui davvero.
 *
 * @param {string} valuta la valuta del conto
 * @param {string} date   la data del movimento (YYYY-MM-DD)
 */
export function toBase(userId, amount, valuta, date, base = null) {
  const principale = base ?? valutaPrincipale(userId);
  if (valuta === principale) return roundLikePhp(amount);
  return convert(userId, amount, valuta, principale, date).amount;
}

/**
 * Come sopra, ma per un importo che può mancare (la quota condivisa di una
 * spesa). Il vuoto resta vuoto: non se ne inventa una.
 */
export const toBaseNullable = (userId, amount, valuta, date, base = null) =>
  (amount === null || amount === undefined || amount === '' ? null : toBase(userId, amount, valuta, date, base));

/**
 * Le quattro tabelle che portano un controvalore, e come si raggiungono il
 * conto (per la valuta) e la data (per il cambio).
 */
const DA_CONVERTIRE = [
  { tabella: 'expenses', conto: 'account_id', data: 'expense_date', quota: 'share_amount' },
  { tabella: 'incomes', conto: 'account_id', data: 'income_date' },
  { tabella: 'transfers', conto: 'source_account_id', data: 'transfer_date' },
  // Una ricorrente e' un modello, non un movimento: non ha una data propria a
  // cui valutarla, quindi vale al cambio di oggi.
  { tabella: 'recurring_expenses', conto: 'account_id', data: null },
];

/**
 * Riempie i controvalori mancanti.
 *
 * Mancante vuol dire una cosa sola: `amount_base IS NULL`. Ci arriva un
 * movimento appena scritto, oppure uno che i trigger di `0006` hanno dichiarato
 * scaduto perché importo, conto, data o valuta sono cambiati. Non serve sapere
 * chi l'ha toccato — ed è il punto: una route scritta il mese prossimo finisce
 * qui dentro senza doversene ricordare.
 *
 * Su un'installazione tutta nella valuta principale — Alessandro, e quasi tutti
 * — non trova mai niente: quattro `SELECT` su indice che tornano vuote, perché
 * un conto nella valuta principale non ha nessun controvalore da calcolare.
 *
 * Un movimento in una valuta di cui non si conosce ancora nessun cambio resta
 * senza: `COALESCE(amount_base, amount)` lo conta com'è, il che è sbagliato ma
 * visibile, e `senzaControvalore()` lo va a cercare per dirlo.
 *
 * @returns {number} quanti ne ha sistemati
 */
export function allinea(userId) {
  const base = valutaPrincipale(userId);
  const oggi = new Date().toISOString().slice(0, 10);
  let fatti = 0;

  for (const { tabella, conto, data, quota } of DA_CONVERTIRE) {
    const colonnaData = data ? `t.${data}` : `'${oggi}'`;
    const righe = all(
      `SELECT t.id, t.amount${quota ? `, t.${quota} AS quota` : ''},
              ${colonnaData} AS data_valore, a.currency
       FROM \`${tabella}\` t
       INNER JOIN accounts a ON a.id = t.${conto}
       WHERE t.user_id = ? AND t.amount_base IS NULL AND a.currency <> ?`,
      userId, base,
    );

    for (const r of righe) {
      let valore;
      try {
        valore = toBase(userId, r.amount, r.currency, r.data_valore, base);
      } catch {
        // Manca il cambio per quella valuta. Non e' il momento di fermare
        // niente: chi stava salvando una spesa non c'entra, e il posto dove
        // dirlo e' la pagina dei cambi.
        continue;
      }
      if (quota) {
        run(
          `UPDATE \`${tabella}\` SET amount_base = ?, share_amount_base = ? WHERE id = ?`,
          valore, toBaseNullable(userId, r.quota, r.currency, r.data_valore, base), r.id,
        );
      } else {
        run(`UPDATE \`${tabella}\` SET amount_base = ? WHERE id = ?`, valore, r.id);
      }
      fatti += 1;
    }
  }
  return fatti;
}

/**
 * I movimenti rimasti senza controvalore, raggruppati per valuta: sono quelli
 * che nei totali contano per il numero sbagliato, e vanno detti.
 */
export function senzaControvalore(userId) {
  const base = valutaPrincipale(userId);
  const pezzi = DA_CONVERTIRE.map(({ tabella, conto }) =>
    `SELECT a.currency, count(*) AS n FROM \`${tabella}\` t
     INNER JOIN accounts a ON a.id = t.${conto}
     WHERE t.user_id = ? AND t.amount_base IS NULL AND a.currency <> ?
     GROUP BY a.currency`);

  const params = DA_CONVERTIRE.flatMap(() => [userId, base]);
  const righe = all(
    `SELECT currency, SUM(n) AS n FROM (${pezzi.join(' UNION ALL ')}) GROUP BY currency ORDER BY currency`,
    ...params,
  );
  return righe.map((r) => ({ valuta: r.currency, movimenti: r.n }));
}

/**
 * Le valute in uso: quella principale più quelle dei conti. Serve a sapere per
 * quali cambi ha senso chiedere qualcosa a Internet.
 */
export function valuteInUso(userId) {
  const righe = one(
    `SELECT group_concat(DISTINCT currency) AS elenco FROM accounts WHERE user_id = ?`, userId,
  );
  const conti = (righe?.elenco ?? '').split(',').filter(Boolean);
  return [...new Set([valutaPrincipale(userId), ...conti])].sort();
}
