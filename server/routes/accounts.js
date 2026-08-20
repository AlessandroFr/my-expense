// Conti — contratto identico a AccountController + App\Account.
// La riconciliazione resta a PHP: tocca expenses/incomes e passa da
// AccountReconciliation, che verra' migrato insieme ai movimenti.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp, roundLikePhp } from '../amount.js';

const TYPES = ['checking', 'card', 'cash', 'savings', 'investment', 'deposit', 'pac', 'other'];
const DETAIL_FIELDS = ['iban', 'bic', 'bank_name', 'account_holder', 'account_number', 'notes'];

const LIST_COLUMNS = `id, name, type, color, icon, opening_balance,
                      iban, bic, bank_name, account_holder, account_number, notes,
                      archived, is_default_cash, sort_order, created_at, updated_at`;

export const allForUser = (userId, includeArchived = false) => all(
  `SELECT ${LIST_COLUMNS} FROM accounts
   WHERE user_id = ?${includeArchived ? '' : ' AND archived = 0'}
   ORDER BY sort_order ASC, name ASC`,
  userId,
);

const findForUser = (id, userId) => one(
  `SELECT id, user_id, name, type, color, icon, opening_balance,
          iban, bic, bank_name, account_holder, account_number, notes,
          archived, is_default_cash, sort_order
   FROM accounts WHERE id = ? AND user_id = ? LIMIT 1`,
  id, userId,
);

const round2 = (n) => roundLikePhp(n, 2);

/** Saldo = apertura + entrate − spese, calcolato al volo come in PHP. */
export function withBalances(userId, includeArchived = false) {
  const accounts = allForUser(userId, includeArchived);
  if (accounts.length === 0) return [];

  const sums = new Map(accounts.map((a) => [a.id, { exp: 0, inc: 0 }]));
  const ids = accounts.map((a) => a.id);
  const placeholders = ids.map(() => '?').join(',');

  for (const [table, key] of [['expenses', 'exp'], ['incomes', 'inc']]) {
    const rows = all(
      `SELECT account_id, COALESCE(SUM(amount), 0) AS total
       FROM ${table} WHERE user_id = ? AND account_id IN (${placeholders})
       GROUP BY account_id`,
      userId, ...ids,
    );
    for (const r of rows) {
      const entry = sums.get(r.account_id);
      if (entry) entry[key] = Number(r.total);
    }
  }

  return accounts.map((a) => {
    const { exp, inc } = sums.get(a.id);
    return {
      ...a,
      expenses_total: round2(exp),
      incomes_total: round2(inc),
      balance: round2(Number(a.opening_balance) + inc - exp),
    };
  });
}

/** Traduce Account::validate. */
function validate(data) {
  const name = str(data.name);
  if (name === '' || [...name].length > 64) {
    throw HttpError.badRequest('Nome conto obbligatorio (max 64 caratteri).');
  }

  const type = str(data.type) || 'checking';
  if (!TYPES.includes(type)) throw HttpError.badRequest('Tipo conto non valido.');

  const isDefaultCash = int(data.is_default_cash) === 1;
  if (isDefaultCash && type !== 'cash') {
    throw HttpError.badRequest("Il flag \"Conto cassa principale\" e' valido solo per conti di tipo Contanti.");
  }

  let color = str(data.color) || '#6c757d';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw HttpError.badRequest('Colore non valido.');
  color = color.toLowerCase();

  let icon = data.icon === undefined || data.icon === null ? null : str(data.icon);
  if (icon === '') icon = null;
  if (icon !== null && [...icon].length > 32) throw HttpError.badRequest('Nome icona troppo lungo.');

  const value = parseAmountLikePhp(data.opening_balance);
  if (value < -99999999.99 || value > 99999999.99) {
    throw HttpError.badRequest('Saldo iniziale fuori range.');
  }

  return {
    name,
    type,
    color,
    icon,
    opening_balance: value.toFixed(2),
    sort_order: int(data.sort_order, 0),
    is_default_cash: isDefaultCash,
  };
}

/** Traduce Account::normalizeDetails: IBAN e BIC normalizzati e verificati. */
function normalizeDetails(data) {
  const out = {};
  for (const field of DETAIL_FIELDS) out[field] = str(data[field]) || null;

  if (out.iban !== null) {
    const iban = out.iban.replace(/\s+/g, '').toUpperCase();
    if ([...iban].length > 34) throw HttpError.badRequest('IBAN troppo lungo (max 34 caratteri).');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) throw HttpError.badRequest('Formato IBAN non valido.');
    out.iban = iban;
  }

  if (out.bic !== null) {
    const bic = out.bic.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) {
      throw HttpError.badRequest('Formato BIC/SWIFT non valido (8 o 11 caratteri).');
    }
    out.bic = bic;
  }

  for (const [field, max] of Object.entries({
    bank_name: 128, account_holder: 128, account_number: 64, notes: 255,
  })) {
    if (out[field] !== null && [...out[field]].length > max) {
      throw HttpError.badRequest(`Campo ${field} troppo lungo (max ${max}).`);
    }
  }
  return out;
}

/** Un solo conto cassa predefinito per utente. */
const clearOtherDefaultCash = (userId, keepId) => run(
  'UPDATE accounts SET is_default_cash = 0 WHERE user_id = ? AND id <> ? AND is_default_cash = 1',
  userId, keepId,
);

const asConflict = (err, name) => {
  if (String(err.message).includes('UNIQUE')) {
    return HttpError.conflict(`Esiste gia' un conto '${name}'.`);
  }
  return err;
};

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const includeArchived = int(searchParams.get('include_archived')) === 1;
  ok(res, { accounts: withBalances(currentUserId(), includeArchived) });
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const row = validate(body);
  const details = normalizeDetails(body);

  const id = transaction(() => {
    let newId;
    try {
      const result = run(
        `INSERT INTO accounts
           (user_id, name, type, color, icon, opening_balance, sort_order,
            iban, bic, bank_name, account_holder, account_number, notes, is_default_cash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, row.name, row.type, row.color, row.icon, row.opening_balance, row.sort_order,
        details.iban, details.bic, details.bank_name,
        details.account_holder, details.account_number, details.notes,
        row.is_default_cash ? 1 : 0,
      );
      newId = Number(result.lastInsertRowid);
    } catch (err) {
      throw asConflict(err, row.name);
    }
    if (row.is_default_cash) clearOtherDefaultCash(userId, newId);
    return newId;
  });

  ok(res, { account: findForUser(id, userId) });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID conto mancante.');

  const row = validate(body);
  const details = normalizeDetails(body);
  const archived = int(body.archived) === 1;

  transaction(() => {
    try {
      run(
        `UPDATE accounts
         SET name = ?, type = ?, color = ?, icon = ?, opening_balance = ?, sort_order = ?,
             archived = ?, iban = ?, bic = ?, bank_name = ?, account_holder = ?,
             account_number = ?, notes = ?, is_default_cash = ?
         WHERE id = ? AND user_id = ?`,
        row.name, row.type, row.color, row.icon, row.opening_balance, row.sort_order,
        archived ? 1 : 0, details.iban, details.bic, details.bank_name,
        details.account_holder, details.account_number, details.notes,
        row.is_default_cash ? 1 : 0, id, userId,
      );
    } catch (err) {
      throw asConflict(err, row.name);
    }
    if (row.is_default_cash) clearOtherDefaultCash(userId, id);
  });

  ok(res, { account: findForUser(id, userId) });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID conto mancante.');

  // I movimenti collegati restano: la FK su account_id e' ON DELETE SET NULL.
  run('DELETE FROM accounts WHERE id = ? AND user_id = ?', id, currentUserId());
  ok(res, { id });
}

export const accountRoutes = {
  'GET /accounts/list': list,
  'POST /accounts/create': create,
  'POST /accounts/update': update,
  'POST /accounts/delete': remove,
};
