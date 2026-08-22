// Investimenti — contratto identico a SecuritiesController + SecuritiesService
// + HoldingsRepository.
//
// Una operazione non tocca solo securities_transactions: genera anche la
// scrittura contabile corrispondente (una spesa per BUY e FEE, un'entrata per
// SELL e DIVIDEND), tutto in una transazione sola. SPLIT non muove denaro.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { HttpError, assertCsrf, int, isValidDate, nullableInt, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp, roundLikePhp } from '../amount.js';
import { NavError, symbolsFromIsin, priceHistory } from '../nav-fetch.js';

const KINDS = ['BUY', 'SELL', 'DIVIDEND', 'FEE', 'SPLIT'];

const DEFAULT_ASSET_CLASSES = [
  { name: 'Azionario', color: '#0d6efd', icon: 'graph-up-arrow', sort_order: 10 },
  { name: 'Obbligazionario', color: '#6c757d', icon: 'shield-check', sort_order: 20 },
  { name: 'Monetario', color: '#20c997', icon: 'cash-coin', sort_order: 30 },
  { name: 'Multi-asset', color: '#6610f2', icon: 'pie-chart', sort_order: 40 },
  { name: 'Immobiliare', color: '#fd7e14', icon: 'building', sort_order: 50 },
];

const round = (n, d) => roundLikePhp(n, d);
const dec2 = (v) => Number(v).toFixed(2);
const dec6 = (v) => Number(v).toFixed(6);

// ─── Classi di attivo ───────────────────────────────────────────────────────

const assetClassToPublic = (r) => ({
  id: r.id, user_id: r.user_id, name: r.name, color: r.color, icon: r.icon ?? null,
  sort_order: r.sort_order, created_at: r.created_at ?? null, updated_at: r.updated_at ?? null,
});

const assetClassesForUser = (userId) => all(
  `SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
   FROM asset_classes WHERE user_id = ? ORDER BY sort_order ASC, name ASC`, userId,
);

const findAssetClass = (id, userId) => one(
  `SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
   FROM asset_classes WHERE id = ? AND user_id = ? LIMIT 1`, id, userId,
);

/** Alla prima apertura la lista non deve essere vuota. */
function ensureDefaultAssetClasses(userId) {
  for (const cls of DEFAULT_ASSET_CLASSES) {
    const exists = one('SELECT 1 AS x FROM asset_classes WHERE user_id = ? AND name = ? LIMIT 1',
      userId, cls.name);
    if (exists) continue;
    try {
      run('INSERT INTO asset_classes (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
        userId, cls.name, cls.color, cls.icon, cls.sort_order);
    } catch { /* gia' creata: nessun problema */ }
  }
}

function normalizeAssetClass(data) {
  const name = str(data.name);
  if (name === '' || [...name].length > 48) throw HttpError.badRequest('Nome classe obbligatorio (max 48).');

  const color = str(data.color) || '#6c757d';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw HttpError.badRequest('Colore non valido.');

  let icon = data.icon === undefined || data.icon === null ? null : str(data.icon);
  if (icon === '') icon = null;
  if (icon !== null && [...icon].length > 32) throw HttpError.badRequest('Nome icona troppo lungo.');

  return {
    name, color: color.toLowerCase(), icon,
    sort_order: data.sort_order === undefined ? 100 : int(data.sort_order, 100),
  };
}

// ─── Strumenti ──────────────────────────────────────────────────────────────

const INSTRUMENT_SELECT = `
  SELECT s.id, s.user_id, s.account_id, s.asset_class_id, s.isin, s.ticker,
         s.name, s.currency, s.notes, s.archived, s.created_at, s.updated_at,
         ac.name AS asset_class_name, ac.color AS asset_class_color, ac.icon AS asset_class_icon,
         a.name AS account_name, a.color AS account_color,
         (SELECT p.price      FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price,
         (SELECT p.price_date FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price_date
  FROM securities_instruments s
  LEFT JOIN asset_classes ac ON ac.id = s.asset_class_id
  LEFT JOIN accounts a       ON a.id  = s.account_id`;

const instrumentToPublic = (r) => ({
  id: r.id,
  user_id: r.user_id,
  account_id: r.account_id ?? null,
  asset_class_id: r.asset_class_id ?? null,
  isin: r.isin ?? null,
  ticker: r.ticker ?? null,
  name: r.name,
  currency: r.currency,
  notes: r.notes ?? null,
  archived: r.archived ? 1 : 0,
  created_at: r.created_at ?? null,
  updated_at: r.updated_at ?? null,
  asset_class_name: r.asset_class_name ?? null,
  asset_class_color: r.asset_class_color ?? null,
  asset_class_icon: r.asset_class_icon ?? null,
  account_name: r.account_name ?? null,
  account_color: r.account_color ?? null,
  last_price: r.last_price === null || r.last_price === undefined ? null : dec6(r.last_price),
  last_price_date: r.last_price_date ?? null,
});

const findInstrument = (id, userId) => {
  const row = one(`${INSTRUMENT_SELECT} WHERE s.id = ? AND s.user_id = ? LIMIT 1`, id, userId);
  return row ? instrumentToPublic(row) : null;
};

function normalizeInstrument(userId, data) {
  const name = str(data.name);
  if (name === '' || [...name].length > 128) throw HttpError.badRequest('Nome strumento obbligatorio (max 128).');

  let isin = data.isin === undefined || data.isin === null ? null : str(data.isin).toUpperCase();
  if (isin === '') isin = null;
  if (isin !== null && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) {
    throw HttpError.badRequest('ISIN non valido (12 caratteri, formato standard).');
  }

  let ticker = data.ticker === undefined || data.ticker === null ? null : str(data.ticker).toUpperCase();
  if (ticker === '') ticker = null;
  if (ticker !== null && [...ticker].length > 16) throw HttpError.badRequest('Ticker troppo lungo (max 16).');

  const currency = (str(data.currency).toUpperCase() || 'EUR');
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw HttpError.badRequest('Currency code non valido (ISO 4217, 3 lettere).');
  }

  const accountId = nullableInt(data.account_id);
  if (accountId !== null && !one('SELECT 1 AS x FROM accounts WHERE id = ? AND user_id = ?', accountId, userId)) {
    throw HttpError.badRequest('Conto non trovato.');
  }
  const assetClassId = nullableInt(data.asset_class_id);
  if (assetClassId !== null && !findAssetClass(assetClassId, userId)) {
    throw HttpError.badRequest('Classe non trovata.');
  }

  let notes = data.notes === undefined || data.notes === null ? null : str(data.notes);
  if (notes === '') notes = null;

  return {
    account_id: accountId,
    asset_class_id: assetClassId,
    isin,
    ticker,
    name,
    currency,
    notes,
    archived: data.archived ? 1 : 0,
  };
}

// ─── Posizioni ──────────────────────────────────────────────────────────────

/**
 * Ricostruisce le posizioni dalle operazioni. Il costo medio si calcola sulle
 * sole compravendite (BUY), commissioni comprese; il realizzato confronta il
 * ricavato delle vendite con quel costo medio.
 */
export function holdingsForUser(userId, accountId = null) {
  const params = [userId];
  let where = 't.user_id = ?';
  if (accountId) { where += ' AND t.account_id = ?'; params.push(accountId); }

  const rows = all(
    `SELECT s.id AS instrument_id, s.name AS instrument_name, s.ticker AS instrument_ticker,
            s.isin AS instrument_isin, s.currency, s.account_id,
            a.name AS account_name, a.color AS account_color,
            s.asset_class_id, ac.name AS asset_class_name, ac.color AS asset_class_color,
            SUM(CASE WHEN t.kind = 'BUY' THEN t.quantity
                     WHEN t.kind = 'SELL' THEN -t.quantity
                     WHEN t.kind = 'SPLIT' THEN t.quantity ELSE 0 END) AS qty,
            SUM(CASE WHEN t.kind = 'BUY' THEN t.quantity ELSE 0 END) AS buy_qty,
            SUM(CASE WHEN t.kind = 'BUY' THEN t.gross_amount + t.fee ELSE 0 END) AS buy_cost,
            SUM(CASE WHEN t.kind = 'SELL' THEN t.net_amount ELSE 0 END) AS sell_proceeds,
            SUM(CASE WHEN t.kind = 'SELL' THEN t.quantity ELSE 0 END) AS sell_qty,
            SUM(CASE WHEN t.kind = 'DIVIDEND' THEN t.net_amount ELSE 0 END) AS dividends,
            SUM(CASE WHEN t.kind = 'FEE' THEN t.gross_amount ELSE 0 END) AS fees,
            (SELECT p.price      FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price,
            (SELECT p.price_date FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price_date
     FROM securities_transactions t
     INNER JOIN securities_instruments s ON s.id = t.instrument_id
     INNER JOIN accounts a               ON a.id = t.account_id
     LEFT  JOIN asset_classes ac         ON ac.id = s.asset_class_id
     WHERE ${where}
     GROUP BY s.id, s.name, s.ticker, s.isin, s.currency, s.account_id, a.name, a.color,
              s.asset_class_id, ac.name, ac.color
     ORDER BY s.name ASC`,
    ...params,
  );

  return rows.map((r) => {
    const qty = Number(r.qty);
    const buyQty = Number(r.buy_qty);
    const buyCost = Number(r.buy_cost);
    const sellProceeds = Number(r.sell_proceeds);
    const sellQty = Number(r.sell_qty);
    const dividends = Number(r.dividends);
    const fees = Number(r.fees);
    const lastPrice = r.last_price === null || r.last_price === undefined ? null : Number(r.last_price);

    const avgCost = buyQty > 0 ? buyCost / buyQty : 0;
    const realized = sellQty > 0 ? sellProceeds - sellQty * avgCost : 0;
    // Senza un prezzo non si puo' valorizzare: meglio nessun numero che uno inventato.
    const markValue = lastPrice !== null ? qty * lastPrice : null;
    const unrealized = markValue !== null ? markValue - qty * avgCost : null;

    return {
      instrument_id: r.instrument_id,
      instrument_name: r.instrument_name,
      instrument_ticker: r.instrument_ticker ?? null,
      instrument_isin: r.instrument_isin ?? null,
      account_id: r.account_id,
      account_name: r.account_name,
      account_color: r.account_color ?? null,
      asset_class_id: r.asset_class_id ?? null,
      asset_class_name: r.asset_class_name ?? null,
      asset_class_color: r.asset_class_color ?? null,
      currency: r.currency ?? 'EUR',
      qty: round(qty, 6),
      avg_cost: round(avgCost, 6),
      buy_cost: round(buyCost, 2),
      realized: round(realized, 2),
      dividends: round(dividends, 2),
      fees: round(fees, 2),
      last_price: lastPrice !== null ? round(lastPrice, 6) : null,
      last_price_date: r.last_price_date ?? null,
      mark_value: markValue !== null ? round(markValue, 2) : null,
      unrealized: unrealized !== null ? round(unrealized, 2) : null,
      total_pnl: round(realized + dividends + (unrealized ?? 0), 2),
    };
  });
}

/** Riassunto per classe di attivo, usato dal widget della dashboard. */
export function holdingsByAssetClass(userId) {
  const groups = new Map();
  for (const h of holdingsForUser(userId)) {
    const key = h.asset_class_id ?? 0;
    if (!groups.has(key)) {
      groups.set(key, {
        asset_class_id: h.asset_class_id,
        asset_class_name: h.asset_class_name ?? 'Senza classe',
        asset_class_color: h.asset_class_color ?? '#6c757d',
        invested: 0, current: 0, hasMarked: false, dividends: 0, pnl: 0,
      });
    }
    const g = groups.get(key);
    g.invested += h.qty * h.avg_cost;
    if (h.mark_value !== null) { g.current += h.mark_value; g.hasMarked = true; }
    g.dividends += h.dividends;
    g.pnl += h.total_pnl;
  }

  return [...groups.values()].map((g) => ({
    asset_class_id: g.asset_class_id,
    asset_class_name: g.asset_class_name,
    asset_class_color: g.asset_class_color,
    invested: round(g.invested, 2),
    current: g.hasMarked ? round(g.current, 2) : null,
    dividends: round(g.dividends, 2),
    pnl: round(g.pnl, 2),
  }));
}

// ─── Operazioni ─────────────────────────────────────────────────────────────

const TRANSACTION_SELECT = `
  SELECT t.id, t.user_id, t.account_id, t.instrument_id, t.kind,
         t.trade_date, t.settlement_date, t.quantity, t.price, t.fee,
         t.gross_amount, t.net_amount, t.tax_withheld,
         t.expense_id, t.income_id, t.notes, t.created_at, t.updated_at,
         s.name AS instrument_name, s.ticker AS instrument_ticker, s.isin AS instrument_isin,
         a.name AS account_name
  FROM securities_transactions t
  INNER JOIN securities_instruments s ON s.id = t.instrument_id
  INNER JOIN accounts a               ON a.id = t.account_id`;

const transactionToPublic = (r) => ({
  id: r.id,
  user_id: r.user_id,
  account_id: r.account_id,
  instrument_id: r.instrument_id,
  kind: r.kind,
  trade_date: r.trade_date,
  settlement_date: r.settlement_date ?? null,
  quantity: dec6(r.quantity),
  price: dec6(r.price),
  fee: dec2(r.fee),
  gross_amount: dec2(r.gross_amount),
  net_amount: dec2(r.net_amount),
  tax_withheld: dec2(r.tax_withheld),
  expense_id: r.expense_id ?? null,
  income_id: r.income_id ?? null,
  notes: r.notes ?? null,
  created_at: r.created_at ?? null,
  updated_at: r.updated_at ?? null,
  instrument_name: r.instrument_name ?? null,
  instrument_ticker: r.instrument_ticker ?? null,
  instrument_isin: r.instrument_isin ?? null,
  account_name: r.account_name ?? null,
});

const findTransaction = (id, userId) => {
  const row = one(`${TRANSACTION_SELECT} WHERE t.id = ? AND t.user_id = ? LIMIT 1`, id, userId);
  return row ? transactionToPublic(row) : null;
};

/** Traduce SecuritiesService::normalizeTransaction, calcoli compresi. */
function normalizeTransaction(userId, data) {
  const accountId = int(data.account_id);
  const instrumentId = int(data.instrument_id);
  if (accountId <= 0 || instrumentId <= 0) {
    throw HttpError.badRequest('Conto e strumento sono obbligatori.');
  }
  if (!one('SELECT 1 AS x FROM accounts WHERE id = ? AND user_id = ?', accountId, userId)) {
    throw HttpError.badRequest('Conto non trovato.');
  }
  const instrument = findInstrument(instrumentId, userId);
  if (!instrument) throw HttpError.badRequest('Strumento non trovato.');

  const kind = str(data.kind).toUpperCase();
  if (!KINDS.includes(kind)) throw HttpError.badRequest('Tipo operazione non valido.');

  const tradeDate = str(data.trade_date);
  if (!isValidDate(tradeDate)) throw HttpError.badRequest('Data operazione non valida (YYYY-MM-DD).');

  let settlement = str(data.settlement_date) || null;
  if (settlement !== null && !isValidDate(settlement)) settlement = null;

  const qty = parseAmountLikePhp(data.quantity);
  const price = parseAmountLikePhp(data.price);
  const fee = parseAmountLikePhp(data.fee);
  const tax = parseAmountLikePhp(data.tax_withheld);

  if (kind !== 'DIVIDEND' && kind !== 'FEE' && qty <= 0) {
    throw HttpError.badRequest("Quantita' deve essere > 0.");
  }
  if (kind === 'DIVIDEND' && price <= 0) {
    throw HttpError.badRequest('Per il dividendo specifica l\'importo nel campo "Importo lordo".');
  }
  if (kind === 'FEE' && fee <= 0 && price <= 0) {
    throw HttpError.badRequest('Importo commissione obbligatorio.');
  }

  // Per il dividendo l'utente scrive il lordo nel campo prezzo.
  const gross = kind === 'BUY' || kind === 'SELL' ? qty * price
    : kind === 'DIVIDEND' ? price
      : kind === 'FEE' ? Math.max(price, fee)
        : 0;

  const net = kind === 'BUY' ? gross + fee           // quanto esce dal conto
    : kind === 'SELL' ? gross - fee - tax            // quanto entra, al netto
      : kind === 'DIVIDEND' ? gross - tax - fee
        : kind === 'FEE' ? gross
          : 0;

  let notes = data.notes === undefined || data.notes === null ? null : str(data.notes);
  if (notes === '') notes = null;

  return {
    account_id: accountId,
    instrument_id: instrumentId,
    instrument_name: instrument.name,
    kind,
    trade_date: tradeDate,
    settlement_date: settlement,
    quantity: qty,
    price,
    fee,
    tax_withheld: tax,
    gross_amount: round(gross, 2),
    net_amount: round(net, 2),
    notes,
  };
}

/** Numero senza zeri inutili in coda, come fa rtrim(rtrim(...,'0'),'.'). */
const trimZeros = (v) => dec6(v).replace(/0+$/, '').replace(/\.$/, '');

const investmentsCategoryId = (userId) => {
  const existing = one('SELECT id FROM categories WHERE user_id = ? AND name = ? LIMIT 1',
    userId, 'Investimenti');
  if (existing) return existing.id;
  const res = run(
    'INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
    userId, 'Investimenti', '#6610f2', 'graph-up-arrow', 100,
  );
  return Number(res.lastInsertRowid);
};

const upsertPrice = (instrumentId, priceDate, price, source) => run(
  `INSERT INTO securities_prices (instrument_id, price_date, price, source) VALUES (?, ?, ?, ?)
   ON CONFLICT(instrument_id, price_date) DO UPDATE SET price = excluded.price, source = excluded.source`,
  instrumentId, priceDate, price, source,
);

/**
 * Un prezzo scaricato, che non tocca quello che c'e' gia': il prezzo scritto a
 * mano vince sempre su quello preso da Internet.
 *
 * @returns {number} 1 se e' stato scritto, 0 se quel giorno c'era gia'
 */
export const insertDownloadedPrice = (instrumentId, priceDate, price) => run(
  `INSERT INTO securities_prices (instrument_id, price_date, price, source)
   VALUES (?, ?, ?, 'external') ON CONFLICT(instrument_id, price_date) DO NOTHING`,
  instrumentId, priceDate, dec6(price),
).changes;

// ─── Una spesa vera che e' un acquisto ──────────────────────────────────────

/**
 * L'acquisto sull'estratto conto e' gia' un movimento: quando lo si registra
 * anche qui, i soldi devono uscire una volta sola.
 *
 * Come per i versamenti nei piani, il punto di partenza e' la spesa importata:
 * si marca, e diventa la faccia in uscita del trasferimento verso il dossier.
 * Non conta piu' come spesa nei report — comprare titoli non e' spendere, e'
 * spostare — ma resta con la sua data e il suo importo, perche' e' una riga
 * vera dell'estratto.
 */

/** L'operazione gia' registrata su una spesa, o null se non ce n'e'. */
export function tradeOfExpense(userId, expenseId) {
  const row = one(
    `SELECT id, instrument_id, quantity, price, fee, gross_amount, net_amount
     FROM securities_transactions WHERE user_id = ? AND expense_id = ? AND kind = 'BUY' LIMIT 1`,
    userId, expenseId,
  );
  return row ? {
    id: row.id, instrument_id: row.instrument_id,
    quantity: dec6(row.quantity), price: dec6(row.price), fee: dec2(row.fee),
  } : null;
}

/** Gli strumenti su cui si puo' registrare un acquisto. */
export const instrumentsForTrade = (userId) => all(
  `${INSTRUMENT_SELECT} WHERE s.user_id = ? AND s.archived = 0 AND s.account_id IS NOT NULL
   ORDER BY s.name ASC`, userId,
).map(instrumentToPublic);

/** Disfa l'acquisto senza portarsi via la spesa. Dentro una transazione. */
function clearTradeRows(userId, expense) {
  run("DELETE FROM securities_transactions WHERE user_id = ? AND expense_id = ? AND kind = 'BUY'",
    userId, expense.id);
  if (expense.transfer_id === null) return;
  run('UPDATE expenses SET is_transfer = 0, transfer_id = NULL WHERE id = ? AND user_id = ?', expense.id, userId);
  run('DELETE FROM transfers WHERE id = ? AND user_id = ?', expense.transfer_id, userId);
}

/**
 * Marca una spesa come acquisto di uno strumento. Con `quantity` a zero la
 * spesa torna una spesa normale.
 *
 * L'importo della spesa e' quello che il conto ha pagato davvero: le
 * commissioni ci sono gia' dentro, quindi il controvalore dei titoli e'
 * l'importo meno le commissioni, e il prezzo unitario viene da li'.
 */
export function setExpenseTrade(userId, expenseId, data) {
  const expense = one(
    `SELECT id, account_id, amount, expense_date, description, transfer_id
     FROM expenses WHERE id = ? AND user_id = ? LIMIT 1`,
    expenseId, userId,
  );
  if (!expense) throw HttpError.notFound('Spesa non trovata.');

  const quantity = parseAmountLikePhp(data.quantity);
  if (quantity <= 0) {
    transaction(() => clearTradeRows(userId, expense));
    return null;
  }

  const instrumentId = int(data.instrument_id);
  const instrument = instrumentId > 0 ? findInstrument(instrumentId, userId) : null;
  if (!instrument) throw HttpError.badRequest('Strumento non trovato.');
  if (instrument.account_id === null) {
    throw HttpError.badRequest(`Allo strumento «${instrument.name}» manca il conto dossier: assegnalo prima.`);
  }
  if (instrument.account_id === expense.account_id) {
    throw HttpError.badRequest("Il conto della spesa e' lo stesso del dossier: non e' un acquisto.");
  }
  if (expense.account_id === null) {
    throw HttpError.badRequest("Assegna un conto alla spesa prima di marcarla come acquisto.");
  }

  const total = roundLikePhp(Number(expense.amount), 2);
  const fee = roundLikePhp(parseAmountLikePhp(data.fee), 2);
  if (fee < 0) throw HttpError.badRequest('Commissione non valida.');
  if (fee >= total) throw HttpError.badRequest('Le commissioni non possono valere quanto tutto il movimento.');

  const gross = roundLikePhp(total - fee, 2);
  const price = gross / quantity;
  const date = expense.expense_date;

  return transaction(() => {
    clearTradeRows(userId, expense);

    const sourceAccount = one('SELECT name FROM accounts WHERE id = ? AND user_id = ?', expense.account_id, userId);
    const transfer = run(
      `INSERT INTO transfers
         (user_id, source_account_id, destination_account_id, amount, transfer_date, description, notes)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      userId, expense.account_id, instrument.account_id, total.toFixed(2), date,
      `Acquisto titoli — ${instrument.name}`.slice(0, 255),
    );
    const transferId = Number(transfer.lastInsertRowid);

    run('UPDATE expenses SET is_transfer = 1, is_investment = 1, transfer_id = ? WHERE id = ? AND user_id = ?',
      transferId, expense.id, userId);
    run(
      `INSERT INTO incomes
         (user_id, account_id, source, description, amount, payment_method,
          income_date, is_transfer, transfer_id)
       VALUES (?, ?, 'Trasferimento', ?, ?, 'transfer', ?, 1, ?)`,
      userId, instrument.account_id,
      `Acquisto titoli da ${sourceAccount?.name ?? 'conto'} — ${instrument.name}`.slice(0, 255),
      total.toFixed(2), date, transferId,
    );

    const r = run(
      `INSERT INTO securities_transactions
         (user_id, account_id, instrument_id, kind, trade_date, quantity, price, fee,
          gross_amount, net_amount, tax_withheld, expense_id)
       VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, '0.00', ?)`,
      userId, instrument.account_id, instrument.id, date,
      dec6(quantity), dec6(price), dec2(fee), dec2(gross), dec2(total), expense.id,
    );

    // Il prezzo pagato e' anche un prezzo di mercato di quel giorno.
    upsertPrice(instrument.id, date, dec6(price), 'manual');
    return Number(r.lastInsertRowid);
  });
}

// ─── Endpoint ───────────────────────────────────────────────────────────────

async function listInstruments(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const clauses = ['s.user_id = ?'];
  const params = [userId];
  const accountId = int(searchParams.get('account_id'));
  const assetClassId = int(searchParams.get('asset_class_id'));
  if (accountId) { clauses.push('s.account_id = ?'); params.push(accountId); }
  if (assetClassId) { clauses.push('s.asset_class_id = ?'); params.push(assetClassId); }
  if (int(searchParams.get('include_archived')) !== 1) clauses.push('s.archived = 0');

  const rows = all(
    `${INSTRUMENT_SELECT} WHERE ${clauses.join(' AND ')}
     ORDER BY s.archived ASC, s.name ASC LIMIT 200 OFFSET 0`,
    ...params,
  );
  ok(res, { instruments: rows.map(instrumentToPublic) });
}

async function holdings(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  ok(res, { holdings: holdingsForUser(currentUserId(), int(searchParams.get('account_id')) || null) });
}

async function createInstrument(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();
  const row = normalizeInstrument(userId, body);

  if (row.isin && one('SELECT 1 AS x FROM securities_instruments WHERE user_id = ? AND isin = ?', userId, row.isin)) {
    throw HttpError.conflict(`Esiste gia' uno strumento con ISIN ${row.isin}.`);
  }
  if (row.ticker && one('SELECT 1 AS x FROM securities_instruments WHERE user_id = ? AND ticker = ?', userId, row.ticker)) {
    throw HttpError.conflict(`Esiste gia' uno strumento con ticker ${row.ticker}.`);
  }

  const result = run(
    `INSERT INTO securities_instruments
       (user_id, account_id, asset_class_id, isin, ticker, name, currency, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, row.account_id, row.asset_class_id, row.isin, row.ticker,
    row.name, row.currency, row.notes, row.archived,
  );
  ok(res, { instrument: findInstrument(Number(result.lastInsertRowid), userId) });
}

async function updateInstrument(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findInstrument(id, userId)) throw HttpError.notFound('Strumento non trovato.');

  const row = normalizeInstrument(userId, body);
  run(
    `UPDATE securities_instruments
     SET account_id = ?, asset_class_id = ?, isin = ?, ticker = ?, name = ?,
         currency = ?, notes = ?, archived = ?
     WHERE id = ? AND user_id = ?`,
    row.account_id, row.asset_class_id, row.isin, row.ticker, row.name,
    row.currency, row.notes, row.archived, id, userId,
  );
  ok(res, { instrument: findInstrument(id, userId) });
}

async function archiveInstrument(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findInstrument(id, userId)) throw HttpError.notFound('Strumento non trovato.');

  const archived = body.archived === undefined ? 1 : (int(body.archived) === 1 ? 1 : 0);
  run('UPDATE securities_instruments SET archived = ? WHERE id = ? AND user_id = ?', archived, id, userId);
  ok(res, { instrument: findInstrument(id, userId) });
}

async function deleteInstrument(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID strumento mancante.');
  run('DELETE FROM securities_instruments WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { deleted: true, id });
}

async function listTransactions(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const clauses = ['t.user_id = ?'];
  const params = [userId];
  const add = (clause, value) => { clauses.push(clause); params.push(value); };

  if (int(searchParams.get('account_id'))) add('t.account_id = ?', int(searchParams.get('account_id')));
  if (int(searchParams.get('instrument_id'))) add('t.instrument_id = ?', int(searchParams.get('instrument_id')));
  if (str(searchParams.get('kind'))) add('t.kind = ?', str(searchParams.get('kind')));
  if (str(searchParams.get('date_from'))) add('t.trade_date >= ?', str(searchParams.get('date_from')));
  if (str(searchParams.get('date_to'))) add('t.trade_date <= ?', str(searchParams.get('date_to')));

  const limit = Math.max(1, Math.min(500, int(searchParams.get('limit'), 200)));
  const offset = Math.max(0, int(searchParams.get('offset'), 0));

  const rows = all(
    `${TRANSACTION_SELECT} WHERE ${clauses.join(' AND ')}
     ORDER BY t.trade_date DESC, t.id DESC LIMIT ${limit} OFFSET ${offset}`,
    ...params,
  );
  ok(res, { transactions: rows.map(transactionToPublic) });
}

async function createTransaction(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const row = normalizeTransaction(userId, body);

  const id = transaction(() => {
    const categoryId = investmentsCategoryId(userId);
    const suffisso = row.fee > 0 ? ` (fee ${dec2(row.fee)})` : '';
    const description = `${row.kind} ${trimZeros(row.quantity)} ${row.instrument_name} @ ${trimZeros(row.price)}${suffisso}`;
    const text = description + (row.notes !== null ? ` — ${row.notes}` : '');

    let expenseId = null;
    let incomeId = null;

    // Comprare e vendere titoli non e' spendere e incassare: e' spostare soldi
    // fra il conto e il dossier. Marcati come i giroconti restano nel saldo del
    // conto ma non nei report, altrimenti il mese di un acquisto da qualche
    // migliaio di euro sembrerebbe un mese di spese folli. Il dividendo invece
    // e' entrata vera, e la commissione e' costo vero: quelli contano.
    const giro = row.kind === 'BUY' || row.kind === 'SELL' ? 1 : 0;

    if (row.kind === 'BUY' || row.kind === 'FEE') {
      const r = run(
        `INSERT INTO expenses
           (user_id, category_id, account_id, amount, description, payment_method,
            expense_date, is_investment, is_transfer)
         VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1, ?)`,
        userId, categoryId, row.account_id, dec2(row.net_amount), text, row.trade_date, giro,
      );
      expenseId = Number(r.lastInsertRowid);
    } else if (row.kind === 'SELL' || row.kind === 'DIVIDEND') {
      const r = run(
        `INSERT INTO incomes
           (user_id, account_id, source, description, amount, payment_method, income_date, is_transfer)
         VALUES (?, ?, ?, ?, ?, 'transfer', ?, ?)`,
        userId, row.account_id, row.kind === 'DIVIDEND' ? 'Dividendo' : 'Vendita titolo',
        text, dec2(row.net_amount), row.trade_date, giro,
      );
      incomeId = Number(r.lastInsertRowid);
    }
    // SPLIT non muove denaro: cambia solo la quantita' in portafoglio.

    const r = run(
      `INSERT INTO securities_transactions
         (user_id, account_id, instrument_id, kind, trade_date, settlement_date,
          quantity, price, fee, gross_amount, net_amount, tax_withheld,
          expense_id, income_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, row.account_id, row.instrument_id, row.kind, row.trade_date, row.settlement_date,
      dec6(row.quantity), dec6(row.price), dec2(row.fee), dec2(row.gross_amount),
      dec2(row.net_amount), dec2(row.tax_withheld), expenseId, incomeId, row.notes,
    );

    // Il prezzo di una compravendita e' anche un prezzo di mercato di quel giorno.
    if ((row.kind === 'BUY' || row.kind === 'SELL') && row.price > 0) {
      upsertPrice(row.instrument_id, row.trade_date, dec6(row.price), 'manual');
    }

    return Number(r.lastInsertRowid);
  });

  ok(res, { transaction: findTransaction(id, userId) });
}

async function deleteTransaction(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  const existing = id > 0 ? findTransaction(id, userId) : null;
  if (!existing) throw HttpError.notFound('Operazione non trovata.');

  // Se l'operazione era stata marcata su un movimento vero dell'estratto, si
  // disfa la marcatura e la spesa torna in elenco: cancellarla vorrebbe dire
  // perdere una riga dell'estratto conto, che e' successa davvero.
  if (existing.expense_id !== null) {
    const expense = one(
      'SELECT id, transfer_id FROM expenses WHERE id = ? AND user_id = ?', existing.expense_id, userId,
    );
    if (expense && expense.transfer_id !== null) {
      transaction(() => clearTradeRows(userId, expense));
      ok(res, { deleted: true, id, restored_expense_id: expense.id });
      return;
    }
  }

  transaction(() => {
    // Via anche la scrittura contabile collegata, altrimenti resterebbe un
    // movimento senza operazione.
    if (existing.expense_id !== null) {
      run('DELETE FROM expenses WHERE id = ? AND user_id = ?', existing.expense_id, userId);
    }
    if (existing.income_id !== null) {
      run('DELETE FROM incomes WHERE id = ? AND user_id = ?', existing.income_id, userId);
    }
    run('DELETE FROM securities_transactions WHERE id = ? AND user_id = ?', id, userId);
  });

  ok(res, { deleted: true, id });
}

async function listPrices(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const instrumentId = int(searchParams.get('instrument_id'));
  if (instrumentId <= 0) throw HttpError.badRequest('ID strumento mancante.');
  if (!findInstrument(instrumentId, userId)) throw HttpError.notFound('Strumento non trovato.');

  const rows = all(
    `SELECT id, instrument_id, price_date, price, source, created_at
     FROM securities_prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT 365`,
    instrumentId,
  );
  ok(res, {
    prices: rows.map((r) => ({
      id: r.id, instrument_id: r.instrument_id, price_date: r.price_date,
      price: dec6(r.price), source: r.source, created_at: r.created_at ?? null,
    })),
  });
}

async function updatePrice(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const instrumentId = int(body.instrument_id);
  if (instrumentId <= 0) throw HttpError.badRequest('ID strumento mancante.');
  if (!findInstrument(instrumentId, userId)) throw HttpError.notFound('Strumento non trovato.');

  const date = str(body.price_date) || new Date().toISOString().slice(0, 10);
  if (!isValidDate(date)) throw HttpError.badRequest('Data prezzo non valida (YYYY-MM-DD).');

  const price = parseAmountLikePhp(body.price);
  if (price <= 0) throw HttpError.badRequest('Prezzo non valido (>0).');

  upsertPrice(instrumentId, date, dec6(price), 'manual');
  ok(res, { updated: true, instrument_id: instrumentId, price_date: date });
}

/**
 * Scarica i prezzi dello strumento e li salva.
 *
 * Stessa strada dei fondi dei piani: parte solo quando l'utente preme il
 * bottone, e non tocca i prezzi gia' presenti — quello scritto a mano vince
 * sempre su quello scaricato.
 */
async function fetchPrices(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const instrumentId = int(body.instrument_id);
  const instrument = instrumentId > 0 ? findInstrument(instrumentId, userId) : null;
  if (!instrument) throw HttpError.notFound('Strumento non trovato.');
  if (!instrument.ticker && !instrument.isin) {
    throw HttpError.badRequest("Allo strumento manca sia l'ISIN sia il ticker: senza non c'e' niente da cercare.");
  }

  try {
    const toTry = instrument.ticker
      ? [instrument.ticker]
      : (await symbolsFromIsin(instrument.isin, instrument.currency)).slice(0, 4);

    // Da un mese prima della prima operazione: prima non servirebbe a niente.
    const first = one(
      'SELECT MIN(trade_date) AS d FROM securities_transactions WHERE user_id = ? AND instrument_id = ?',
      userId, instrumentId,
    )?.d ?? null;
    const da = str(body.from) || (first
      ? new Date(new Date(`${first}T00:00:00Z`).getTime() - 31 * 86400000).toISOString().slice(0, 10)
      : null);

    // La valuta sbagliata non e' un dettaglio: quei prezzi farebbero sembrare
    // il titolo cresciuto o calato per il cambio.
    let series = null;
    let symbol = null;
    const rejected = [];
    for (const candidate of toTry) {
      const s = await priceHistory(candidate, da);
      if (s.currency && s.currency !== instrument.currency.toUpperCase()) {
        rejected.push(`${candidate} (${s.currency})`);
        continue;
      }
      series = s;
      symbol = candidate;
      break;
    }
    if (series === null) {
      throw new NavError(
        `Trovato solo ${rejected.join(', ')}, ma lo strumento e' in ${instrument.currency}. `
        + "Scrivi a mano il ticker sulla scheda dello strumento: per l'Italia finisce in .MI "
        + '(per esempio CSSPX.MI).',
      );
    }

    if (symbol !== instrument.ticker) {
      run('UPDATE securities_instruments SET ticker = ? WHERE id = ? AND user_id = ?', symbol, instrumentId, userId);
    }

    let saved = 0;
    transaction(() => {
      for (const p of series.points) saved += insertDownloadedPrice(instrumentId, p.nav_date, p.nav);
    });

    ok(res, {
      symbol,
      currency: series.currency,
      downloaded: series.points.length,
      saved,
      from_date: series.points[0]?.nav_date ?? null,
      to_date: series.points[series.points.length - 1]?.nav_date ?? null,
    });
  } catch (err) {
    if (err instanceof NavError) throw HttpError.badRequest(err.message);
    throw err;
  }
}

async function getExpenseTrade(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const expenseId = int(searchParams.get('expense_id'));
  if (expenseId <= 0) throw HttpError.badRequest('ID spesa mancante.');

  ok(res, {
    instruments: instrumentsForTrade(userId).map((i) => ({
      id: i.id, name: i.name, ticker: i.ticker, currency: i.currency,
      account_id: i.account_id, account_name: i.account_name,
    })),
    trade: tradeOfExpense(userId, expenseId),
  });
}

/** Marca (o smarca, con quantita' zero) una spesa come acquisto di titoli. */
async function saveExpenseTrade(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const expenseId = int(body.expense_id);
  if (expenseId <= 0) throw HttpError.badRequest('ID spesa mancante.');

  const id = setExpenseTrade(userId, expenseId, body);
  ok(res, { expense_id: expenseId, transaction_id: id, trade: tradeOfExpense(userId, expenseId) });
}

async function deletePrice(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const instrumentId = int(body.instrument_id);
  const id = int(body.id);
  if (instrumentId <= 0 || id <= 0) throw HttpError.badRequest('ID prezzo o strumento mancante.');
  if (!findInstrument(instrumentId, userId)) throw HttpError.notFound('Strumento non trovato.');

  run('DELETE FROM securities_prices WHERE id = ? AND instrument_id = ?', id, instrumentId);
  ok(res, { deleted: true, id });
}

async function listAssetClasses(req, res) {
  const userId = currentUserId();
  ensureDefaultAssetClasses(userId);
  ok(res, { asset_classes: assetClassesForUser(userId).map(assetClassToPublic) });
}

async function createAssetClass(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const row = normalizeAssetClass(body);
  if (one('SELECT 1 AS x FROM asset_classes WHERE user_id = ? AND name = ?', userId, row.name)) {
    throw HttpError.conflict(`Esiste gia' una classe '${row.name}'.`);
  }
  const result = run(
    'INSERT INTO asset_classes (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
    userId, row.name, row.color, row.icon, row.sort_order,
  );
  ok(res, { asset_class: assetClassToPublic(findAssetClass(Number(result.lastInsertRowid), userId)) });
}

async function updateAssetClass(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findAssetClass(id, userId)) throw HttpError.notFound('Classe non trovata.');

  const row = normalizeAssetClass(body);
  run('UPDATE asset_classes SET name = ?, color = ?, icon = ?, sort_order = ? WHERE id = ? AND user_id = ?',
    row.name, row.color, row.icon, row.sort_order, id, userId);
  ok(res, { asset_class: assetClassToPublic(findAssetClass(id, userId)) });
}

async function deleteAssetClass(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID classe mancante.');
  // Gli strumenti collegati restano, senza classe: FK ON DELETE SET NULL.
  run('DELETE FROM asset_classes WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { deleted: true, id });
}

export const securitiesRoutes = {
  'GET /securities/list': listInstruments,
  'GET /securities/holdings': holdings,
  'POST /securities/instrument/create': createInstrument,
  'POST /securities/instrument/update': updateInstrument,
  'POST /securities/instrument/archive': archiveInstrument,
  'POST /securities/instrument/delete': deleteInstrument,
  'GET /securities/transactions/list': listTransactions,
  'POST /securities/transactions/create': createTransaction,
  'POST /securities/transactions/delete': deleteTransaction,
  'GET /securities/prices': listPrices,
  'POST /securities/prices/update': updatePrice,
  'POST /securities/prices/delete': deletePrice,
  'POST /securities/prices/fetch': fetchPrices,
  'GET /securities/expense-trade': getExpenseTrade,
  'POST /securities/expense-trade': saveExpenseTrade,
  'GET /securities/asset-classes': listAssetClasses,
  'POST /securities/asset-classes/create': createAssetClass,
  'POST /securities/asset-classes/update': updateAssetClass,
  'POST /securities/asset-classes/delete': deleteAssetClass,
};
