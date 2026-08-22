// Piani di accumulo.
//
// Un versamento non e' solo una riga in pac_contributions: e' anche un
// trasferimento dal conto sorgente al conto PAC, con la spesa e l'entrata che
// ne derivano. Tutto in una transazione, altrimenti i saldi non tornano.
//
// I versamenti non si generano piu' da soli dal piano: i soldi escono davvero
// dal conto una volta sola, e quella volta si vede sull'estratto conto. Quindi
// il punto di partenza e' il movimento importato, che viene marcato come
// versamento e diviso fra i piani (setExpenseSplit). Il piano resta il modello
// di quella divisione — importo, frequenza, fondo — e serve a proporla.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp, roundLikePhp } from '../amount.js';
import { normalizeShares, sharesMismatch } from '../pac-split.js';
import { transfersCategoryId } from './categories.js';
import { summary } from '../pac-performance.js';
import { NavError, symbolsFromIsin, priceHistory } from '../nav-fetch.js';

const FUND_TYPES = ['etf', 'mutual', 'index', 'other'];
const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const dec2 = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));
const dec6 = (v) => (v === null || v === undefined ? null : Number(v).toFixed(6));
const today = () => new Date().toISOString().slice(0, 10);
const nullableInt = (raw) => {
  if (raw === null || raw === undefined || raw === '' || raw === '0' || raw === 0) return null;
  return int(raw);
};

// ─── Fondi ──────────────────────────────────────────────────────────────────

const FUND_SELECT = `
  SELECT f.id, f.user_id, f.asset_class_id, f.name, f.isin, f.symbol, f.fund_type,
         f.currency, f.notes, f.archived, f.created_at, f.updated_at,
         ac.name AS asset_class_name, ac.color AS asset_class_color,
         (SELECT n.nav      FROM pac_fund_navs n WHERE n.fund_id = f.id ORDER BY n.nav_date DESC LIMIT 1) AS last_nav,
         (SELECT n.nav_date FROM pac_fund_navs n WHERE n.fund_id = f.id ORDER BY n.nav_date DESC LIMIT 1) AS last_nav_date
  FROM pac_funds f
  LEFT JOIN asset_classes ac ON ac.id = f.asset_class_id`;

const fundToPublic = (r) => ({
  id: r.id,
  user_id: r.user_id,
  asset_class_id: r.asset_class_id ?? null,
  name: r.name,
  isin: r.isin ?? null,
  symbol: r.symbol ?? null,
  fund_type: r.fund_type,
  currency: r.currency,
  notes: r.notes ?? null,
  archived: r.archived ? 1 : 0,
  created_at: r.created_at ?? null,
  updated_at: r.updated_at ?? null,
  asset_class_name: r.asset_class_name ?? null,
  asset_class_color: r.asset_class_color ?? null,
  last_nav: r.last_nav === null || r.last_nav === undefined ? null : dec6(r.last_nav),
  last_nav_date: r.last_nav_date ?? null,
});

const findFund = (id, userId) => {
  const row = one(`${FUND_SELECT} WHERE f.id = ? AND f.user_id = ? LIMIT 1`, id, userId);
  return row ? fundToPublic(row) : null;
};

/** Ultimo NAV noto a quella data, o prima: serve a convertire importo in quote. */
const navOnOrBefore = (fundId, date) => {
  const row = one(
    'SELECT nav FROM pac_fund_navs WHERE fund_id = ? AND nav_date <= ? ORDER BY nav_date DESC LIMIT 1',
    fundId, date,
  );
  return row ? Number(row.nav) : null;
};

function normalizeFund(data) {
  const name = str(data.name);
  if (name === '' || [...name].length > 128) throw HttpError.badRequest('Nome fondo obbligatorio (max 128).');

  let isin = data.isin === undefined || data.isin === null ? null : str(data.isin).toUpperCase();
  if (isin === '') isin = null;
  if (isin !== null && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw HttpError.badRequest('ISIN non valido.');

  const fundType = (str(data.fund_type) || 'etf').toLowerCase();
  if (!FUND_TYPES.includes(fundType)) throw HttpError.badRequest('Tipo fondo non valido.');

  const currency = str(data.currency).toUpperCase() || 'EUR';
  if (!/^[A-Z]{3}$/.test(currency)) throw HttpError.badRequest('Currency non valida.');

  let notes = data.notes === undefined || data.notes === null ? null : str(data.notes);
  if (notes === '') notes = null;

  // Il simbolo di borsa (SWDA.MI): lettere, cifre, punto e trattino, nient'altro.
  let symbol = data.symbol === undefined || data.symbol === null ? null : str(data.symbol).toUpperCase();
  if (symbol === '') symbol = null;
  if (symbol !== null && !/^[A-Z0-9.\-^]{1,20}$/.test(symbol)) {
    throw HttpError.badRequest('Simbolo di borsa non valido (es. SWDA.MI).');
  }

  return {
    name,
    isin,
    symbol,
    asset_class_id: nullableInt(data.asset_class_id),
    fund_type: fundType,
    currency,
    notes,
    archived: data.archived ? 1 : 0,
  };
}

// ─── Piani ──────────────────────────────────────────────────────────────────

const PLAN_SELECT = `
  SELECT p.id, p.user_id, p.account_id, p.source_account_id, p.fund_id,
         p.name, p.frequency, p.amount, p.start_date, p.end_date,
         p.beneficiary_iban, p.beneficiary_keyword,
         p.active, p.notes, p.created_at, p.updated_at,
         a.name AS account_name, sa.name AS source_account_name, f.name AS fund_name,
         ac.name AS asset_class_name, ac.color AS asset_class_color
  FROM pac_plans p
  INNER JOIN accounts a   ON a.id  = p.account_id
  LEFT  JOIN accounts sa  ON sa.id = p.source_account_id
  INNER JOIN pac_funds f  ON f.id  = p.fund_id
  LEFT  JOIN asset_classes ac ON ac.id = f.asset_class_id`;

const planToPublic = (r) => ({
  id: r.id,
  user_id: r.user_id,
  account_id: r.account_id,
  source_account_id: r.source_account_id ?? null,
  fund_id: r.fund_id,
  name: r.name,
  frequency: r.frequency,
  amount: dec2(r.amount),
  start_date: r.start_date,
  end_date: r.end_date ?? null,
  beneficiary_iban: r.beneficiary_iban ?? null,
  beneficiary_keyword: r.beneficiary_keyword ?? null,
  active: r.active ? 1 : 0,
  notes: r.notes ?? null,
  created_at: r.created_at ?? null,
  updated_at: r.updated_at ?? null,
  account_name: r.account_name ?? null,
  source_account_name: r.source_account_name ?? null,
  fund_name: r.fund_name ?? null,
  asset_class_name: r.asset_class_name ?? null,
  asset_class_color: r.asset_class_color ?? null,
});

const findPlan = (id, userId) => {
  const row = one(`${PLAN_SELECT} WHERE p.id = ? AND p.user_id = ? LIMIT 1`, id, userId);
  return row ? planToPublic(row) : null;
};

function normalizePlan(userId, data) {
  const name = str(data.name);
  if (name === '' || [...name].length > 96) throw HttpError.badRequest('Nome piano obbligatorio (max 96).');

  const accountId = int(data.account_id);
  const fundId = int(data.fund_id);
  if (accountId <= 0 || fundId <= 0) throw HttpError.badRequest('Conto PAC e fondo obbligatori.');

  const account = one('SELECT type FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', accountId, userId);
  if (!account) throw HttpError.badRequest('Conto PAC non trovato.');
  if (account.type !== 'pac') throw HttpError.badRequest('Il conto destinazione deve essere di tipo PAC.');
  if (!findFund(fundId, userId)) throw HttpError.badRequest('Fondo non trovato.');

  const sourceId = nullableInt(data.source_account_id);
  if (sourceId !== null) {
    if (sourceId === accountId) throw HttpError.badRequest("Il conto sorgente non puo' coincidere con il conto PAC.");
    if (!one('SELECT 1 AS x FROM accounts WHERE id = ? AND user_id = ?', sourceId, userId)) {
      throw HttpError.badRequest('Conto sorgente non trovato.');
    }
  }

  const frequency = str(data.frequency) || 'monthly';
  if (!FREQUENCIES.includes(frequency)) throw HttpError.badRequest('Frequenza non valida.');

  const amount = parseAmountLikePhp(data.amount);
  if (amount < 0.01) throw HttpError.badRequest('Importo non valido (>0.01).');

  const startDate = str(data.start_date);
  if (!isValidDate(startDate)) throw HttpError.badRequest('Data inizio non valida (YYYY-MM-DD).');

  let endDate = str(data.end_date) || null;
  if (endDate !== null && !isValidDate(endDate)) endDate = null;

  let iban = data.beneficiary_iban === undefined || data.beneficiary_iban === null
    ? null : str(data.beneficiary_iban).replace(/\s+/g, '').toUpperCase();
  if (iban === '') iban = null;
  if (iban !== null && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    throw HttpError.badRequest('IBAN beneficiario non valido.');
  }

  let keyword = data.beneficiary_keyword === undefined || data.beneficiary_keyword === null
    ? null : str(data.beneficiary_keyword);
  if (keyword === '') keyword = null;
  if (keyword !== null && [...keyword].length > 64) throw HttpError.badRequest('Keyword troppo lunga (max 64).');

  let notes = data.notes === undefined || data.notes === null ? null : str(data.notes);
  if (notes === '') notes = null;
  if (notes !== null && [...notes].length > 255) throw HttpError.badRequest('Note troppo lunghe.');

  return {
    account_id: accountId,
    source_account_id: sourceId,
    fund_id: fundId,
    name,
    frequency,
    amount: amount.toFixed(2),
    start_date: startDate,
    end_date: endDate,
    beneficiary_iban: iban,
    beneficiary_keyword: keyword,
    notes,
  };
}

// ─── Versamenti ─────────────────────────────────────────────────────────────

const CONTRIBUTION_SELECT = `
  SELECT c.id, c.user_id, c.plan_id, c.contribution_date, c.amount,
         c.nav, c.units, c.transfer_id, c.expense_id, c.source, c.notes, c.created_at,
         p.name AS plan_name, f.id AS fund_id, f.name AS fund_name
  FROM pac_contributions c
  INNER JOIN pac_plans p ON p.id = c.plan_id
  INNER JOIN pac_funds f ON f.id = p.fund_id`;

const contributionToPublic = (r) => ({
  id: r.id,
  user_id: r.user_id,
  plan_id: r.plan_id,
  contribution_date: r.contribution_date,
  amount: dec2(r.amount),
  nav: r.nav === null || r.nav === undefined ? null : dec6(r.nav),
  units: r.units === null || r.units === undefined ? null : dec6(r.units),
  transfer_id: r.transfer_id ?? null,
  expense_id: r.expense_id ?? null,
  source: r.source,
  notes: r.notes ?? null,
  created_at: r.created_at ?? null,
  plan_name: r.plan_name ?? null,
  fund_name: r.fund_name ?? null,
  fund_id: r.fund_id ?? null,
});

const summaryForPlan = (planId) => {
  const r = one(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total_amount,
            COALESCE(SUM(units), 0) AS total_units
     FROM pac_contributions WHERE plan_id = ?`,
    planId,
  );
  return { count: r.cnt, total_amount: Number(r.total_amount), total_units: Number(r.total_units) };
};

/**
 * Crea il versamento e il trasferimento che lo accompagna, in una transazione
 * sola. Ritorna null se per quel piano e quella data un versamento esiste gia':
 * e' cosi' che generatePending resta idempotente.
 */
function createContributionAtomic(userId, plan, date, source, notes = null) {
  const esiste = one(
    'SELECT 1 AS x FROM pac_contributions WHERE user_id = ? AND plan_id = ? AND contribution_date = ? LIMIT 1',
    userId, plan.plan_id ?? plan.id, date,
  );
  if (esiste) return null;

  const amount = Number(plan.amount);

  return transaction(() => {
    const sorgente = one('SELECT name FROM accounts WHERE id = ? AND user_id = ?', plan.source_account_id, userId);
    const destinazione = one('SELECT name FROM accounts WHERE id = ? AND user_id = ?', plan.account_id, userId);
    if (!sorgente || !destinazione) throw HttpError.badRequest('Conto non trovato.');

    const descrizione = `PAC ${plan.name} — versamento ${source}`;
    const r = run(
      `INSERT INTO transfers
         (user_id, source_account_id, destination_account_id, amount, transfer_date, description, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId, plan.source_account_id, plan.account_id, amount.toFixed(2), date, descrizione, notes,
    );
    const transferId = Number(r.lastInsertRowid);
    const categoryId = transfersCategoryId(userId);

    run(
      `INSERT INTO expenses
         (user_id, category_id, account_id, amount, description, payment_method,
          expense_date, is_transfer, transfer_id)
       VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1, ?)`,
      userId, categoryId, plan.source_account_id, amount.toFixed(2),
      `Trasferimento verso ${destinazione.name} — ${descrizione}`, date, transferId,
    );
    run(
      `INSERT INTO incomes
         (user_id, account_id, source, description, amount, payment_method,
          income_date, is_transfer, transfer_id)
       VALUES (?, ?, 'Trasferimento', ?, ?, 'transfer', ?, 1, ?)`,
      userId, plan.account_id, `Trasferimento da ${sorgente.name} — ${descrizione}`,
      amount.toFixed(2), date, transferId,
    );

    // Le quote si ricavano dal NAV di quel giorno; senza NAV il versamento si
    // registra lo stesso, ma senza quote.
    const nav = navOnOrBefore(plan.fund_id, date);
    const units = nav !== null && nav > 0 ? amount / nav : null;

    try {
      const c = run(
        `INSERT INTO pac_contributions
           (user_id, plan_id, contribution_date, amount, nav, units, transfer_id, source, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, plan.id, date, amount.toFixed(2),
        nav !== null ? dec6(nav) : null, units !== null ? dec6(units) : null,
        transferId, source, notes,
      );
      return Number(c.lastInsertRowid);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return null;
      throw err;
    }
  });
}

// ─── Una spesa divisa fra piu' piani ────────────────────────────────────────

/** I piani attivi che possono ricevere quote, nell'ordine in cui si mostrano. */
export function plansForSplit(userId) {
  return all(`${PLAN_SELECT} WHERE p.user_id = ? AND p.active = 1 ORDER BY p.name ASC`, userId)
    .map(planToPublic);
}

/** Le quote gia' registrate su una spesa: vuoto se non e' un versamento. */
export function splitOfExpense(userId, expenseId) {
  return all(
    'SELECT plan_id, amount FROM pac_contributions WHERE user_id = ? AND expense_id = ? ORDER BY id ASC',
    userId, expenseId,
  ).map((r) => ({ plan_id: r.plan_id, amount: dec2(r.amount) }));
}

/**
 * Disfa il versamento senza portarsi via la spesa.
 *
 * La spesa e' una riga vera dell'estratto conto: cancellarla vorrebbe dire
 * perdere un movimento successo davvero. Quindi prima si stacca dal
 * trasferimento (altrimenti la CASCADE se la porterebbe dietro), poi si toglie
 * il trasferimento — e con lui l'entrata sul conto PAC e i versamenti.
 * Da chiamare dentro una transazione.
 */
function clearSplitRows(userId, expense) {
  run('DELETE FROM pac_contributions WHERE user_id = ? AND expense_id = ?', userId, expense.id);
  if (expense.transfer_id === null) return;
  run('UPDATE expenses SET is_transfer = 0, transfer_id = NULL WHERE id = ? AND user_id = ?', expense.id, userId);
  run('DELETE FROM transfers WHERE id = ? AND user_id = ?', expense.transfer_id, userId);
}

/**
 * Marca una spesa come versamento, diviso in quote fra i piani indicati.
 *
 * Con l'elenco vuoto la spesa torna una spesa normale. Ripassare quote nuove
 * rifa' tutto da capo: e' l'unico modo per correggere una divisione sbagliata
 * senza dover disfare a mano trasferimento, entrata e versamenti.
 *
 * Ritorna quante quote sono state scritte.
 */
export function setExpenseSplit(userId, expenseId, rawShares, source = 'manual') {
  const expense = one(
    `SELECT id, account_id, amount, expense_date, description, transfer_id
     FROM expenses WHERE id = ? AND user_id = ? LIMIT 1`,
    expenseId, userId,
  );
  if (!expense) throw HttpError.notFound('Spesa non trovata.');

  let shares;
  try {
    shares = normalizeShares(rawShares);
  } catch (err) {
    throw HttpError.badRequest(err.message);
  }

  if (shares.length === 0) {
    transaction(() => clearSplitRows(userId, expense));
    return 0;
  }

  const mismatch = sharesMismatch(shares, Number(expense.amount));
  if (mismatch !== null) throw HttpError.badRequest(mismatch);

  if (expense.account_id === null) {
    throw HttpError.badRequest('Assegna un conto alla spesa prima di marcarla come versamento.');
  }

  const plans = shares.map((share) => {
    const plan = findPlan(share.plan_id, userId);
    if (!plan) throw HttpError.badRequest('Piano di accumulo non trovato.');
    return { ...plan, share: share.amount };
  });

  // Il trasferimento ha una destinazione sola: quote su conti PAC diversi
  // sarebbero due movimenti, non uno.
  const destinations = new Set(plans.map((plan) => plan.account_id));
  if (destinations.size > 1) {
    throw HttpError.badRequest('Le quote devono andare su piani dello stesso conto PAC.');
  }
  const destinationId = plans[0].account_id;
  if (destinationId === expense.account_id) {
    throw HttpError.badRequest("Il conto della spesa e' lo stesso del conto PAC: non e' un versamento.");
  }

  const date = expense.expense_date;
  const total = roundLikePhp(Number(expense.amount));

  return transaction(() => {
    clearSplitRows(userId, expense);

    const planNames = plans.map((plan) => plan.name).join(', ');
    const transfer = run(
      `INSERT INTO transfers
         (user_id, source_account_id, destination_account_id, amount, transfer_date, description, notes)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      userId, expense.account_id, destinationId, total.toFixed(2), date,
      `Versamento PAC — ${planNames}`.slice(0, 255),
    );
    const transferId = Number(transfer.lastInsertRowid);

    // La spesa non sparisce e non cambia importo: diventa la faccia in uscita
    // del trasferimento, cosi' smette di contare come spesa nei report.
    run('UPDATE expenses SET is_transfer = 1, transfer_id = ? WHERE id = ? AND user_id = ?',
      transferId, expense.id, userId);

    const sourceAccount = one('SELECT name FROM accounts WHERE id = ? AND user_id = ?', expense.account_id, userId);
    run(
      `INSERT INTO incomes
         (user_id, account_id, source, description, amount, payment_method,
          income_date, is_transfer, transfer_id)
       VALUES (?, ?, 'Trasferimento', ?, ?, 'transfer', ?, 1, ?)`,
      userId, destinationId, `Versamento PAC da ${sourceAccount?.name ?? 'conto'} — ${planNames}`.slice(0, 255),
      total.toFixed(2), date, transferId,
    );

    for (const plan of plans) {
      const nav = navOnOrBefore(plan.fund_id, date);
      const units = nav !== null && nav > 0 ? plan.share / nav : null;
      try {
        run(
          `INSERT INTO pac_contributions
             (user_id, plan_id, contribution_date, amount, nav, units, transfer_id, expense_id, source, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          userId, plan.id, date, plan.share.toFixed(2),
          nav !== null ? dec6(nav) : null, units !== null ? dec6(units) : null,
          transferId, expense.id, source,
        );
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) {
          throw HttpError.conflict(`Il piano «${plan.name}» ha gia' un versamento in data ${date}.`);
        }
        throw err;
      }
    }
    return plans.length;
  });
}

// ─── Endpoint ───────────────────────────────────────────────────────────────

async function listFunds(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const includeArchived = int(searchParams.get('include_archived')) === 1;
  const rows = all(
    `${FUND_SELECT} WHERE f.user_id = ?${includeArchived ? '' : ' AND f.archived = 0'}
     ORDER BY f.archived ASC, f.name ASC`,
    currentUserId(),
  );
  ok(res, { funds: rows.map(fundToPublic) });
}

async function createFund(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const row = normalizeFund(body);
  if (one('SELECT 1 AS x FROM pac_funds WHERE user_id = ? AND name = ?', userId, row.name)) {
    throw HttpError.conflict(`Esiste gia' un fondo '${row.name}'.`);
  }
  const result = run(
    `INSERT INTO pac_funds (user_id, name, isin, symbol, asset_class_id, fund_type, currency, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, row.name, row.isin, row.symbol, row.asset_class_id, row.fund_type, row.currency, row.notes, row.archived,
  );
  ok(res, { fund: findFund(Number(result.lastInsertRowid), userId) });
}

async function updateFund(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findFund(id, userId)) throw HttpError.notFound('Fondo non trovato.');

  const row = normalizeFund(body);
  run(
    `UPDATE pac_funds SET name = ?, isin = ?, symbol = ?, asset_class_id = ?, fund_type = ?,
            currency = ?, notes = ?, archived = ? WHERE id = ? AND user_id = ?`,
    row.name, row.isin, row.symbol, row.asset_class_id, row.fund_type, row.currency, row.notes, row.archived, id, userId,
  );
  ok(res, { fund: findFund(id, userId) });
}

async function deleteFund(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID fondo mancante.');
  run('DELETE FROM pac_funds WHERE id = ? AND user_id = ?', id, currentUserId());
  ok(res, { deleted: true, id });
}

async function listNavs(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();
  const fundId = int(searchParams.get('fund_id'));
  if (fundId <= 0) throw HttpError.badRequest('ID fondo mancante.');
  if (!findFund(fundId, userId)) throw HttpError.notFound('Fondo non trovato.');

  ok(res, {
    navs: all(
      'SELECT id, fund_id, nav_date, nav FROM pac_fund_navs WHERE fund_id = ? ORDER BY nav_date DESC LIMIT 365',
      fundId,
    ).map((r) => ({ id: r.id, fund_id: r.fund_id, nav_date: r.nav_date, nav: dec6(r.nav) })),
  });
}

async function updateNav(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const fundId = int(body.fund_id);
  if (fundId <= 0) throw HttpError.badRequest('ID fondo mancante.');
  if (!findFund(fundId, userId)) throw HttpError.notFound('Fondo non trovato.');

  const date = str(body.nav_date) || today();
  if (!isValidDate(date)) throw HttpError.badRequest('Data NAV non valida (YYYY-MM-DD).');

  const nav = parseAmountLikePhp(body.nav);
  if (nav <= 0) throw HttpError.badRequest('NAV deve essere > 0.');

  run(
    `INSERT INTO pac_fund_navs (fund_id, nav_date, nav) VALUES (?, ?, ?)
     ON CONFLICT(fund_id, nav_date) DO UPDATE SET nav = excluded.nav`,
    fundId, date, dec6(nav),
  );
  ok(res, { updated: true, fund_id: fundId, nav_date: date });
}

async function deleteNav(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const fundId = int(body.fund_id);
  const id = int(body.id);
  if (fundId <= 0 || id <= 0) throw HttpError.badRequest('ID NAV o fondo mancante.');
  if (!findFund(fundId, userId)) throw HttpError.notFound('Fondo non trovato.');

  run('DELETE FROM pac_fund_navs WHERE id = ? AND fund_id = ?', id, fundId);
  ok(res, { deleted: true, id });
}

async function listPlans(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();
  const onlyActive = int(searchParams.get('only_active')) === 1;

  const rows = all(
    `${PLAN_SELECT} WHERE p.user_id = ?${onlyActive ? ' AND p.active = 1' : ''}
     ORDER BY p.active DESC, p.name ASC`,
    userId,
  ).map(planToPublic);

  const plans = rows.map((plan) => {
    const sum = summaryForPlan(plan.id);
    const fund = findFund(plan.fund_id, userId);
    const lastNav = fund?.last_nav === null || fund?.last_nav === undefined ? null : Number(fund.last_nav);

    // Il valore attuale si mostra solo se c'e' un NAV e delle quote: senza,
    // qualsiasi numero sarebbe inventato.
    const valorizzabile = lastNav !== null && sum.total_units > 0;
    const current = valorizzabile ? sum.total_units * lastNav : null;

    return {
      ...plan,
      total_contributions: sum.count,
      total_amount: sum.total_amount.toFixed(2),
      total_units: sum.total_units.toFixed(6),
      current_value: current !== null ? current.toFixed(2) : null,
      unrealized_pnl: current !== null ? (current - sum.total_amount).toFixed(2) : null,
    };
  });

  ok(res, { plans });
}

async function createPlan(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const row = normalizePlan(userId, body);
  const result = run(
    `INSERT INTO pac_plans
       (user_id, account_id, source_account_id, fund_id, name, frequency, amount,
        start_date, end_date, beneficiary_iban, beneficiary_keyword, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, row.account_id, row.source_account_id, row.fund_id, row.name, row.frequency,
    row.amount, row.start_date, row.end_date, row.beneficiary_iban, row.beneficiary_keyword, row.notes,
  );
  ok(res, { plan: findPlan(Number(result.lastInsertRowid), userId) });
}

async function updatePlan(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findPlan(id, userId)) throw HttpError.notFound('Piano non trovato.');

  const row = normalizePlan(userId, body);
  run(
    `UPDATE pac_plans
     SET account_id = ?, source_account_id = ?, fund_id = ?, name = ?, frequency = ?,
         amount = ?, start_date = ?, end_date = ?, beneficiary_iban = ?,
         beneficiary_keyword = ?, notes = ?
     WHERE id = ? AND user_id = ?`,
    row.account_id, row.source_account_id, row.fund_id, row.name, row.frequency,
    row.amount, row.start_date, row.end_date, row.beneficiary_iban,
    row.beneficiary_keyword, row.notes, id, userId,
  );
  ok(res, { plan: findPlan(id, userId) });
}

async function togglePlan(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findPlan(id, userId)) throw HttpError.notFound('Piano non trovato.');

  run('UPDATE pac_plans SET active = ? WHERE id = ? AND user_id = ?',
    int(body.active) === 1 ? 1 : 0, id, userId);
  ok(res, { plan: findPlan(id, userId) });
}

async function deletePlan(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID piano mancante.');
  run('DELETE FROM pac_plans WHERE id = ? AND user_id = ?', id, currentUserId());
  ok(res, { deleted: true, id });
}

/** I piani su cui si puo' dividere una spesa, con la divisione gia' presente. */
async function getExpenseSplit(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const expenseId = int(searchParams.get('expense_id'));
  if (expenseId <= 0) throw HttpError.badRequest('ID spesa mancante.');

  ok(res, {
    plans: plansForSplit(userId).map((p) => ({
      id: p.id, name: p.name, amount: p.amount, fund_name: p.fund_name,
      account_id: p.account_id, account_name: p.account_name,
    })),
    shares: splitOfExpense(userId, expenseId),
  });
}

/** Marca (o smarca, con l'elenco vuoto) una spesa come versamento nei piani. */
async function saveExpenseSplit(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const expenseId = int(body.expense_id);
  if (expenseId <= 0) throw HttpError.badRequest('ID spesa mancante.');

  let shares = body.shares;
  if (typeof shares === 'string') {
    try { shares = JSON.parse(shares); } catch { throw HttpError.badRequest('Formato quote non valido (JSON atteso).'); }
  }

  const contributions = setExpenseSplit(userId, expenseId, shares ?? []);
  ok(res, { expense_id: expenseId, contributions, shares: splitOfExpense(userId, expenseId) });
}

async function listContributions(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const clauses = ['c.user_id = ?'];
  const params = [userId];
  const add = (clause, value) => { clauses.push(clause); params.push(value); };
  if (int(searchParams.get('plan_id'))) add('c.plan_id = ?', int(searchParams.get('plan_id')));
  if (str(searchParams.get('date_from'))) add('c.contribution_date >= ?', str(searchParams.get('date_from')));
  if (str(searchParams.get('date_to'))) add('c.contribution_date <= ?', str(searchParams.get('date_to')));

  const limit = Math.max(1, Math.min(500, int(searchParams.get('limit'), 200)));
  const offset = Math.max(0, int(searchParams.get('offset'), 0));

  const rows = all(
    `${CONTRIBUTION_SELECT} WHERE ${clauses.join(' AND ')}
     ORDER BY c.contribution_date DESC, c.id DESC LIMIT ${limit} OFFSET ${offset}`,
    ...params,
  );
  ok(res, { contributions: rows.map(contributionToPublic) });
}

/**
 * Scarica le quotazioni del fondo e le salva come NAV.
 *
 * Parte solo su richiesta e non tocca i NAV gia' presenti: quello scritto a
 * mano vince sempre su quello scaricato, perche' se l'utente si e' preso la
 * briga di scriverlo un motivo ci sara'.
 */
async function fetchNavs(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const fundId = int(body.fund_id);
  const fund = fundId > 0 ? findFund(fundId, userId) : null;
  if (!fund) throw HttpError.notFound('Fondo non trovato.');
  if (!fund.symbol && !fund.isin) {
    throw HttpError.badRequest('Al fondo manca sia l\'ISIN sia il simbolo di borsa: senza non c\'e\' niente da cercare.');
  }

  try {
    // Col simbolo gia' scritto sul fondo si va dritti; senza si prova la
    // lista che esce dall'ISIN, dal piu' probabile in giu'.
    const toTry = fund.symbol ? [fund.symbol] : (await symbolsFromIsin(fund.isin, fund.currency)).slice(0, 4);

    // Da un mese prima del primo versamento: prima non servirebbe a niente.
    const primo = one(
      `SELECT MIN(c.contribution_date) AS d FROM pac_contributions c
       INNER JOIN pac_plans p ON p.id = c.plan_id
       WHERE c.user_id = ? AND p.fund_id = ?`, userId, fundId,
    )?.d ?? null;
    const da = str(body.from) || (primo ? new Date(new Date(`${primo}T00:00:00Z`).getTime() - 31 * 86400000).toISOString().slice(0, 10) : null);

    // La valuta sbagliata non e' un dettaglio: quei numeri farebbero sembrare
    // il piano cresciuto o calato per il cambio. Meglio provare la borsa dopo.
    let series = null;
    let symbol = null;
    const rejected = [];
    for (const candidate of toTry) {
      const s = await priceHistory(candidate, da);
      if (s.currency && s.currency !== fund.currency.toUpperCase()) {
        rejected.push(`${candidate} (${s.currency})`);
        continue;
      }
      series = s;
      symbol = candidate;
      break;
    }
    if (series === null) {
      throw new NavError(
        `Trovato solo ${rejected.join(', ')}, ma il fondo e' in ${fund.currency}. `
        + 'Scrivi a mano il simbolo di borsa sulla scheda del fondo: per l\'Italia finisce in .MI '
        + '(per esempio SWDA.MI).',
      );
    }

    // Il simbolo buono resta scritto sul fondo: la volta dopo si va dritti.
    if (symbol !== fund.symbol) {
      run('UPDATE pac_funds SET symbol = ? WHERE id = ? AND user_id = ?', symbol, fundId, userId);
    }

    let saved = 0;
    let valued = 0;
    transaction(() => {
      for (const q of series.points) {
        const r = run(
          'INSERT OR IGNORE INTO pac_fund_navs (fund_id, nav_date, nav) VALUES (?, ?, ?)',
          fundId, q.nav_date, q.nav,
        );
        saved += r.changes;
      }

      // I versamenti registrati quando il NAV non c'era erano rimasti senza
      // quote, e senza quote non entrano nel valore del piano. Ora il NAV c'e'.
      const orphans = all(
        `SELECT c.id, c.contribution_date, c.amount FROM pac_contributions c
         INNER JOIN pac_plans p ON p.id = c.plan_id
         WHERE c.user_id = ? AND p.fund_id = ? AND (c.nav IS NULL OR c.units IS NULL)`,
        userId, fundId,
      );
      for (const c of orphans) {
        const nav = navOnOrBefore(fundId, c.contribution_date);
        if (nav === null || nav <= 0) continue;
        run(
          'UPDATE pac_contributions SET nav = ?, units = ? WHERE id = ? AND user_id = ?',
          dec6(nav), dec6(Number(c.amount) / nav), c.id, userId,
        );
        valued += 1;
      }
    });

    ok(res, {
      symbol,
      currency: series.currency,
      downloaded: series.points.length,
      saved,
      valued,
      from_date: series.points[0]?.nav_date ?? null,
      to_date: series.points[series.points.length - 1]?.nav_date ?? null,
    });
  } catch (err) {
    if (err instanceof NavError) throw HttpError.badRequest(err.message);
    throw err;
  }
}

/**
 * L'andamento del piano: quanto e' entrato, quanto vale, quanto ha reso.
 *
 * I versamenti sono l'altra faccia dei trasferimenti dal conto sorgente (ogni
 * riga di pac_contributions ne porta l'id), quindi «quanto e' entrato» qui e
 * quanto e' uscito dal conto sono lo stesso numero per costruzione.
 */
async function performance(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const planId = int(searchParams.get('plan_id'));
  const plan = planId > 0 ? findPlan(planId, userId) : null;
  if (!plan) throw HttpError.notFound('Piano non trovato.');

  const contributi = all(
    `SELECT contribution_date, amount, nav, units FROM pac_contributions
     WHERE user_id = ? AND plan_id = ? ORDER BY contribution_date ASC`,
    userId, planId,
  );
  const navs = all(
    'SELECT nav_date, nav FROM pac_fund_navs WHERE fund_id = ? ORDER BY nav_date ASC',
    plan.fund_id,
  );

  ok(res, { plan_id: planId, ...summary(contributi, navs, today()) });
}

async function createContribution(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const planId = int(body.plan_id);
  const plan = planId > 0 ? findPlan(planId, userId) : null;
  if (!plan) throw HttpError.notFound('Piano non trovato.');
  if (plan.source_account_id === null) {
    throw HttpError.badRequest('Imposta il conto sorgente sul piano prima di versare.');
  }

  const date = str(body.contribution_date) || str(body.date);
  if (!isValidDate(date)) throw HttpError.badRequest('Data non valida (YYYY-MM-DD).');

  const amount = parseAmountLikePhp(body.amount);
  if (amount <= 0) throw HttpError.badRequest('Importo deve essere > 0.');

  let notes = str(body.notes) || null;

  // Il versamento manuale usa il proprio importo, non quello del piano.
  const id = createContributionAtomic(
    userId, { ...plan, amount: amount.toFixed(2), notes: notes ?? plan.notes }, date, 'manual', notes,
  );
  if (id === null) {
    throw HttpError.conflict('Esiste gia\' un versamento per questo piano in questa data.');
  }

  ok(res, {
    contribution: contributionToPublic(one(`${CONTRIBUTION_SELECT} WHERE c.id = ? AND c.user_id = ?`, id, userId)),
  });
}

async function deleteContribution(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID versamento mancante.');

  const row = one('SELECT transfer_id, expense_id FROM pac_contributions WHERE id = ? AND user_id = ?', id, userId);
  if (!row) throw HttpError.notFound('Versamento non trovato.');

  // Se il versamento arriva da un movimento vero, si disfa tutta la divisione
  // di quel movimento e la spesa torna in elenco: cancellare la riga da sola
  // lascerebbe sul conto PAC dei soldi che nessun piano dichiara piu'.
  if (row.expense_id !== null) {
    const expense = one('SELECT id, transfer_id FROM expenses WHERE id = ? AND user_id = ?', row.expense_id, userId);
    if (expense) {
      transaction(() => clearSplitRows(userId, expense));
      ok(res, { deleted: true, id, restored_expense_id: expense.id });
      return;
    }
  }

  transaction(() => {
    run('DELETE FROM pac_contributions WHERE id = ? AND user_id = ?', id, userId);
    // Via anche il trasferimento che lo aveva accompagnato: spesa ed entrata
    // spariscono con lui per effetto della CASCADE.
    if (row.transfer_id !== null) {
      run('DELETE FROM transfers WHERE id = ? AND user_id = ?', row.transfer_id, userId);
    }
  });

  ok(res, { deleted: true, id, restored_expense_id: null });
}

export const pacRoutes = {
  'GET /pac/funds': listFunds,
  'POST /pac/funds/create': createFund,
  'POST /pac/funds/update': updateFund,
  'POST /pac/funds/delete': deleteFund,
  'GET /pac/funds/navs': listNavs,
  'POST /pac/funds/nav-update': updateNav,
  'POST /pac/funds/nav-delete': deleteNav,
  'POST /pac/funds/nav-fetch': fetchNavs,
  'GET /pac/plans': listPlans,
  'POST /pac/plans/create': createPlan,
  'POST /pac/plans/update': updatePlan,
  'POST /pac/plans/toggle': togglePlan,
  'POST /pac/plans/delete': deletePlan,
  'GET /pac/contributions': listContributions,
  'GET /pac/plans/performance': performance,
  'POST /pac/contributions/create': createContribution,
  'POST /pac/contributions/delete': deleteContribution,
  'GET /pac/expense-split': getExpenseSplit,
  'POST /pac/expense-split': saveExpenseSplit,
};
