/**
 * I cambi.
 *
 * Servono solo a chi ha un conto in una valuta diversa dalla principale: un
 * conto in franchi produce spese in franchi, e i totali generali le mostrano
 * convertite. Chi ha tutto in una valuta sola non passa mai di qui.
 *
 * Valgono le stesse regole delle quotazioni dei fondi, e per lo stesso motivo:
 * si scarica **solo a bottone premuto**, mai all'avvio e mai in sottofondo, e
 * quello che è stato scritto a mano non viene mai sovrascritto da quello che
 * arriva da Internet.
 */

import { all, currentUserId, one, run } from '../db.js';
import { assertCsrf, HttpError, int, isValidDate, ok, readBody, str } from '../http.js';
import { parseAmountItaliano } from '../amount.js';
import { allinea, PERNO, senzaControvalore, valutaPrincipale, valuteInUso } from '../fx.js';
import { NavError, priceHistory } from '../nav-fetch.js';

/** Il simbolo con cui Yahoo quota una valuta contro l'euro. */
export const simboloYahoo = (quote) => `${PERNO}${quote}=X`;

function valuta(raw) {
  const v = str(raw).toUpperCase();
  if (!/^[A-Z]{3}$/.test(v)) throw HttpError.badRequest('La valuta è una sigla di tre lettere, per esempio CHF.');
  if (v === PERNO) throw HttpError.badRequest(`${PERNO} è il perno: vale sempre uno e non si inserisce.`);
  return v;
}

/** L'elenco dei cambi, il più recente per primo. */
export const listForUser = (userId, quote = null, limite = 200) => all(
  `SELECT id, quote, rate_date, rate, source, created_at, updated_at
   FROM exchange_rates WHERE user_id = ?${quote ? ' AND quote = ?' : ''}
   ORDER BY rate_date DESC, quote ASC LIMIT ?`,
  ...(quote ? [userId, quote, limite] : [userId, limite]),
);

/**
 * Da quando servono i cambi di una valuta: la data del movimento più vecchio
 * su un conto che la usa. Senza movimenti non serve niente.
 */
function daQuandoServe(userId, quote) {
  const riga = one(
    `SELECT min(d) AS da FROM (
       SELECT min(e.expense_date) AS d FROM expenses e
         INNER JOIN accounts a ON a.id = e.account_id
         WHERE e.user_id = ? AND a.currency = ?
       UNION ALL
       SELECT min(i.income_date) FROM incomes i
         INNER JOIN accounts a ON a.id = i.account_id
         WHERE i.user_id = ? AND a.currency = ?
       UNION ALL
       SELECT min(t.transfer_date) FROM transfers t
         INNER JOIN accounts a ON a.id = t.source_account_id
         WHERE t.user_id = ? AND a.currency = ?
     )`,
    userId, quote, userId, quote, userId, quote,
  );
  return riga?.da ?? null;
}

/**
 * Dichiara scaduti i controvalori dei movimenti in una valuta.
 *
 * Serve quando un cambio viene corretto o cancellato: i movimenti che si
 * appoggiavano a quello valgono un altro numero, e finché non si rifà il conto
 * nei totali c'è la cifra di prima. `null` per tutte le valute straniere.
 */
function scadenzaValuta(userId, quote = null) {
  const base = valutaPrincipale(userId);
  const filtro = quote ? 'currency = ?' : 'currency <> ?';
  const valore = quote ?? base;

  for (const [tabella, conto] of [
    ['expenses', 'account_id'], ['incomes', 'account_id'],
    ['transfers', 'source_account_id'], ['recurring_expenses', 'account_id'],
  ]) {
    run(
      `UPDATE \`${tabella}\` SET amount_base = NULL
       WHERE user_id = ? AND ${conto} IN (SELECT id FROM accounts WHERE user_id = ? AND ${filtro})`,
      userId, userId, valore,
    );
  }
}

async function list(req, res) {
  const userId = currentUserId();
  const { searchParams } = new URL(req.url, 'http://localhost');
  const quote = str(searchParams.get('quote')).toUpperCase() || null;

  ok(res, {
    base: valutaPrincipale(userId),
    perno: PERNO,
    valute: valuteInUso(userId).filter((v) => v !== PERNO),
    scoperti: senzaControvalore(userId),
    rates: listForUser(userId, quote),
  });
}

async function save(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const quote = valuta(body.quote);
  const rateDate = str(body.rate_date);
  if (!isValidDate(rateDate)) throw HttpError.badRequest('Data non valida.');

  const rate = parseAmountItaliano(body.rate);
  if (!(rate > 0)) throw HttpError.badRequest('Il cambio dev\'essere un numero maggiore di zero.');

  // Scritto a mano: vince su quello scaricato, sempre. Chi corregge un cambio
  // sa qualcosa che Yahoo non sa.
  run(
    `INSERT INTO exchange_rates (user_id, quote, rate_date, rate, source)
     VALUES (?, ?, ?, ?, 'manual')
     ON CONFLICT (user_id, quote, rate_date)
     DO UPDATE SET rate = excluded.rate, source = 'manual'`,
    userId, quote, rateDate, rate,
  );

  // Un cambio corretto cambia il valore dei movimenti che ci si appoggiavano:
  // riempire solo i vuoti lascerebbe in giro le cifre di prima.
  scadenzaValuta(userId, quote);
  ok(res, { sistemati: allinea(userId), scoperti: senzaControvalore(userId) });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  const riga = one('SELECT quote FROM exchange_rates WHERE id = ? AND user_id = ?', id, userId);
  if (!riga) throw HttpError.notFound('Cambio non trovato.');
  run('DELETE FROM exchange_rates WHERE id = ? AND user_id = ?', id, userId);

  // I movimenti che si appoggiavano a questo cambio adesso valgono un altro
  // numero: si rifanno tutti quelli della valuta, non solo i vuoti.
  scadenzaValuta(userId, riga.quote);
  ok(res, { sistemati: allinea(userId), scoperti: senzaControvalore(userId) });
}

/**
 * Scarica i cambi da Yahoo, uno scarico per valuta.
 *
 * Si prende tutta la serie da quando serve a oggi, invece del singolo giorno di
 * ogni movimento: è **una** chiamata invece di centinaia, e i giorni scaricati
 * in più coprono i movimenti che arriveranno.
 */
async function scarica(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const richieste = str(body.quote)
    ? [valuta(body.quote)]
    : valuteInUso(userId).filter((v) => v !== PERNO);

  if (richieste.length === 0) {
    throw HttpError.badRequest(`Non c'è nessun conto in una valuta diversa da ${PERNO}: non serve nessun cambio.`);
  }

  const esito = [];
  for (const quote of richieste) {
    const da = daQuandoServe(userId, quote);
    try {
      const serie = await priceHistory(simboloYahoo(quote), da);
      let nuovi = 0;
      for (const p of serie.points) {
        // OR IGNORE: quello che c'è già non si tocca, e quello che c'è già può
        // essere stato scritto a mano.
        nuovi += run(
          `INSERT OR IGNORE INTO exchange_rates (user_id, quote, rate_date, rate, source)
           VALUES (?, ?, ?, ?, 'external')`,
          userId, quote, p.nav_date, p.nav,
        ).changes;
      }
      esito.push({ valuta: quote, nuovi, da });
    } catch (err) {
      // Una valuta che non si scarica non deve fermare le altre: il messaggio
      // finisce accanto alla sua riga.
      esito.push({ valuta: quote, errore: err instanceof NavError ? err.message : String(err.message) });
    }
  }

  const sistemati = allinea(userId);
  ok(res, { esito, sistemati, scoperti: senzaControvalore(userId) });
}

/** Rifà i conti a mano, per chi ha corretto dei cambi e vuole vedere l'effetto. */
async function ricalcola(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  // Tutti, non solo i vuoti: chi preme questo bottone vuole rifare i conti,
  // non riempire i buchi.
  scadenzaValuta(userId);
  ok(res, { sistemati: allinea(userId), scoperti: senzaControvalore(userId) });
}

/**
 * Cambia la valuta principale: quella in cui si leggono i totali generali.
 *
 * Il trigger `tr_users_valuta_principale_cambiata` dichiara scaduti tutti i
 * controvalori — in un'altra valuta nessuno di quei numeri vale piu' — e
 * `allinea()` li rifa' subito.
 */
async function principale(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const nuova = str(body.base_currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(nuova)) {
    throw HttpError.badRequest('La valuta è una sigla di tre lettere, per esempio EUR.');
  }
  if (nuova === valutaPrincipale(userId)) return ok(res, { sistemati: 0 });

  run('UPDATE users SET base_currency = ? WHERE id = ?', nuova, userId);
  return ok(res, {
    base: nuova,
    sistemati: allinea(userId),
    scoperti: senzaControvalore(userId),
  });
}

export const cambiRoutes = {
  'GET /cambi/list': list,
  'POST /cambi/save': save,
  'POST /cambi/delete': remove,
  'POST /cambi/scarica': scarica,
  'POST /cambi/ricalcola': ricalcola,
  'POST /cambi/principale': principale,
};
