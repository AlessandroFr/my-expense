// Investimenti — contratto identico a SecuritiesController + SecuritiesService
// + HoldingsRepository.
//
// Una operazione non tocca solo securities_transactions: genera anche la
// scrittura contabile corrispondente (una spesa per BUY e FEE, un'entrata per
// SELL e DIVIDEND), tutto in una transazione sola. SPLIT non muove denaro.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp, roundLikePhp } from '../amount.js';

const KINDS = ['BUY', 'SELL', 'DIVIDEND', 'FEE', 'SPLIT'];

const DEFAULT_ASSET_CLASSES = [
  { name: 'Azionario', color: '#0d6efd', icon: 'graph-up-arrow', sort_order: 10 },
  { name: 'Obbligazionario', color: '#6c757d', icon: 'shield-check', sort_order: 20 },
  { name: 'Monetario', color: '#20c997', icon: 'cash-coin', sort_order: 30 },
  { name: 'Multi-asset', color: '#6610f2', icon: 'pie-chart', sort_order: 40 },
  { name: 'Immobiliare', color: '#fd7e14', icon: 'building', sort_order: 50 },
];

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const round = (n, d) => roundLikePhp(n, d);
const dec2 = (v) => Number(v).toFixed(2);
const dec6 = (v) => Number(v).toFixed(6);
const nullableInt = (raw) => {
  if (raw === null || raw === undefined || raw === '' || raw === '0' || raw === 0) return null;
  return int(raw);
};

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
  const gruppi = new Map();
  for (const h of holdingsForUser(userId)) {
    const key = h.asset_class_id ?? 0;
    if (!gruppi.has(key)) {
      gruppi.set(key, {
        asset_class_id: h.asset_class_id,
        asset_class_name: h.asset_class_name ?? 'Senza classe',
        asset_class_color: h.asset_class_color ?? '#6c757d',
        invested: 0, current: 0, hasMarked: false, dividends: 0, pnl: 0,
      });
    }
    const g = gruppi.get(key);
    g.invested += h.qty * h.avg_cost;
    if (h.mark_value !== null) { g.current += h.mark_value; g.hasMarked = true; }
    g.dividends += h.dividends;
    g.pnl += h.total_pnl;
  }

  return [...gruppi.values()].map((g) => ({
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
    const descrizione = `${row.kind} ${trimZeros(row.quantity)} ${row.instrument_name} @ ${trimZeros(row.price)}${suffisso}`;
    const testo = descrizione + (row.notes !== null ? ` — ${row.notes}` : '');

    let expenseId = null;
    let incomeId = null;

    if (row.kind === 'BUY' || row.kind === 'FEE') {
      const r = run(
        `INSERT INTO expenses
           (user_id, category_id, account_id, amount, description, payment_method, expense_date, is_investment)
         VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1)`,
        userId, categoryId, row.account_id, dec2(row.net_amount), testo, row.trade_date,
      );
      expenseId = Number(r.lastInsertRowid);
    } else if (row.kind === 'SELL' || row.kind === 'DIVIDEND') {
      const r = run(
        `INSERT INTO incomes
           (user_id, account_id, source, description, amount, payment_method, income_date)
         VALUES (?, ?, ?, ?, ?, 'transfer', ?)`,
        userId, row.account_id, row.kind === 'DIVIDEND' ? 'Dividendo' : 'Vendita titolo',
        testo, dec2(row.net_amount), row.trade_date,
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
  'GET /securities/asset-classes': listAssetClasses,
  'POST /securities/asset-classes/create': createAssetClass,
  'POST /securities/asset-classes/update': updateAssetClass,
  'POST /securities/asset-classes/delete': deleteAssetClass,
};
