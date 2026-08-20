// Entrate — contratto identico a IncomeController + IncomeService + Repository.

import { all, one, run, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp } from '../amount.js';

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));

const SELECT_COLUMNS = `
  i.id, i.user_id, i.contact_id, i.account_id, i.source, i.description, i.amount,
  i.income_date, i.value_date, i.import_hash, i.created_at, i.updated_at,
  a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
  co.name AS contact_name, co.color AS contact_color, co.type AS contact_type`;

const JOINS = `
  FROM incomes i
  LEFT JOIN accounts a  ON a.id  = i.account_id
  LEFT JOIN contacts co ON co.id = i.contact_id`;

/** Serializzazione identica a Income::toArray. */
const toPublic = (row) => ({
  id: row.id,
  user_id: row.user_id,
  account_id: row.account_id ?? null,
  contact_id: row.contact_id ?? null,
  source: row.source,
  description: row.description ?? null,
  amount: money(row.amount),
  income_date: row.income_date,
  value_date: row.value_date ?? null,
  created_at: row.created_at ?? null,
  updated_at: row.updated_at ?? null,
  account_name: row.account_name ?? null,
  account_color: row.account_color ?? null,
  account_icon: row.account_icon ?? null,
  contact_name: row.contact_name ?? null,
  contact_color: row.contact_color ?? null,
  contact_type: row.contact_type ?? null,
});

/** Traduce IncomeRepository::buildWhere. I trasferimenti non compaiono mai. */
function buildWhere(userId, f) {
  const clauses = ['i.user_id = ?', 'i.is_transfer = 0'];
  const params = [userId];
  const add = (clause, ...values) => { clauses.push(clause); params.push(...values); };

  if (f.date_from && isValidDate(f.date_from)) add('i.income_date >= ?', f.date_from);
  if (f.date_to && isValidDate(f.date_to)) add('i.income_date <= ?', f.date_to);
  if (f.source) add('i.source = ?', str(f.source));
  if (f.account_id) add('i.account_id = ?', int(f.account_id));
  if (f.contact_id) add('i.contact_id = ?', int(f.contact_id));
  // La ricerca guarda sia la descrizione sia l'origine.
  if (f.search) add('(i.description LIKE ? OR i.source LIKE ?)', `%${f.search}%`, `%${f.search}%`);

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

const findById = (id, userId) => {
  const row = one(`SELECT ${SELECT_COLUMNS} ${JOINS} WHERE i.id = ? AND i.user_id = ? LIMIT 1`, id, userId);
  return row ? toPublic(row) : null;
};

const nullableInt = (raw) => {
  if (raw === null || raw === undefined || raw === '' || raw === '0' || raw === 0) return null;
  return int(raw);
};

const ownedExists = (userId, table, id) =>
  Boolean(one(`SELECT 1 AS x FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`, id, userId));

/** Traduce IncomeService::normalize + i controlli di appartenenza. */
function normalize(userId, data) {
  const source = str(data.source);
  if (source === '' || [...source].length > 64) {
    throw HttpError.badRequest('Origine entrata obbligatoria (max 64 caratteri).');
  }

  const amount = parseAmountLikePhp(data.amount);
  if (amount < 0.01) throw HttpError.badRequest('Importo non valido (minimo 0.01).');
  if (amount > 99999999.99) throw HttpError.badRequest('Importo troppo grande.');

  const incomeDate = str(data.income_date);
  if (!isValidDate(incomeDate)) throw HttpError.badRequest('Data non valida (formato YYYY-MM-DD).');

  let description = data.description === undefined || data.description === null ? null : str(data.description);
  if (description === '') description = null;
  if (description !== null && [...description].length > 8192) {
    throw HttpError.badRequest('Descrizione troppo lunga (max 8192 caratteri).');
  }

  const accountId = nullableInt(data.account_id);
  if (accountId !== null && !ownedExists(userId, 'accounts', accountId)) {
    throw HttpError.badRequest('Conto non trovato.');
  }

  const contactId = nullableInt(data.contact_id);
  if (contactId !== null && !ownedExists(userId, 'contacts', contactId)) {
    throw HttpError.badRequest('Anagrafica non trovata.');
  }

  return {
    source,
    description,
    amount: amount.toFixed(2),
    income_date: incomeDate,
    account_id: accountId,
    contact_id: contactId,
  };
}

/** Come per le spese, la creazione al volo dell'anagrafica resta a PHP. */
function assertNoPendingContactName(data) {
  if (!nullableInt(data.contact_id) && str(data.contact_name) !== '') {
    throw HttpError.badRequest(
      'Seleziona un cliente esistente: la creazione al volo non e\' ancora disponibile da questo percorso.',
    );
  }
}

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const filters = {
    date_from: str(searchParams.get('date_from')),
    date_to: str(searchParams.get('date_to')),
    source: str(searchParams.get('source')),
    account_id: nullableInt(searchParams.get('account_id')),
    contact_id: nullableInt(searchParams.get('contact_id')),
    search: str(searchParams.get('search')),
  };
  const limit = Math.max(1, Math.min(500, int(searchParams.get('limit'), 200)));
  const offset = Math.max(0, int(searchParams.get('offset'), 0));

  const { where, params } = buildWhere(userId, filters);
  const rows = all(
    `SELECT ${SELECT_COLUMNS} ${JOINS} ${where}
     ORDER BY i.income_date DESC, i.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    ...params,
  );

  ok(res, {
    incomes: rows.map(toPublic),
    total: one(`SELECT COUNT(*) AS n ${JOINS} ${where}`, ...params).n,
    sources: all(
      'SELECT DISTINCT source FROM incomes i WHERE i.user_id = ? ORDER BY source ASC', userId,
    ).map((r) => r.source),
    limit,
    offset,
  });
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  assertNoPendingContactName(body);
  const row = normalize(userId, body);

  const result = run(
    `INSERT INTO incomes (user_id, account_id, contact_id, source, description, amount, income_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    userId, row.account_id, row.contact_id, row.source, row.description, row.amount, row.income_date,
  );
  ok(res, { income: findById(Number(result.lastInsertRowid), userId) });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !ownedExists(userId, 'incomes', id)) throw HttpError.notFound('Entrata non trovata.');

  assertNoPendingContactName(body);
  const row = normalize(userId, body);

  run(
    `UPDATE incomes
     SET account_id = ?, contact_id = ?, source = ?, description = ?, amount = ?, income_date = ?
     WHERE id = ? AND user_id = ?`,
    row.account_id, row.contact_id, row.source, row.description, row.amount, row.income_date, id, userId,
  );
  ok(res, { income: findById(id, userId) });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID entrata mancante.');
  if (!ownedExists(userId, 'incomes', id)) throw HttpError.notFound('Entrata non trovata.');

  run('DELETE FROM incomes WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { id });
}

export const incomeRoutes = {
  'GET /incomes/list': list,
  'POST /incomes/create': create,
  'POST /incomes/update': update,
  'POST /incomes/delete': remove,
};
