// Spese — contratto identico a ExpenseController + ExpenseService + Repository.
//
// Restano a PHP l'export/import CSV (CsvService) e la rateizzazione, che
// passano da InstallmentCalculator: verranno migrati insieme all'importer.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { HttpError, assertCsrf, int, isValidDate, nullableInt, ok, readBody, str } from '../http.js';
import { money, parseAmountLikePhp } from '../amount.js';
import { checkForCategory } from './budgets.js';
import { findOrCreate as findOrCreateContact } from './contacts.js';
import { inBase } from '../fx.js';

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];


/** Come number_format($v, 2, '.', ''): il frontend riceve gli importi come stringhe. */

const SELECT_COLUMNS = `
  e.id, e.user_id, e.category_id, e.contact_id, e.account_id, e.amount, e.description,
  e.shared_with, e.share_amount,
  e.payment_method, e.expense_date, e.value_date, e.import_hash,
  e.parent_expense_id, e.installment_seq, e.installment_total,
  e.created_at, e.updated_at,
  c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
  a.name AS account_name,  a.color AS account_color,  a.icon AS account_icon,
  co.name AS contact_name, co.color AS contact_color, co.type AS contact_type`;

const JOINS = `
  FROM expenses e
  LEFT JOIN categories c  ON c.id  = e.category_id
  LEFT JOIN accounts   a  ON a.id  = e.account_id
  LEFT JOIN contacts   co ON co.id = e.contact_id`;

/** Serializzazione identica a Expense::toArray. */
function toPublic(row, tags = []) {
  return {
    id: row.id,
    user_id: row.user_id,
    category_id: row.category_id ?? null,
    contact_id: row.contact_id ?? null,
    account_id: row.account_id ?? null,
    amount: money(row.amount),
    description: row.description ?? null,
    shared_with: row.shared_with ?? null,
    share_amount: row.share_amount === null || row.share_amount === undefined ? null : money(row.share_amount),
    payment_method: row.payment_method,
    expense_date: row.expense_date,
    value_date: row.value_date ?? null,
    parent_expense_id: row.parent_expense_id ?? null,
    installment_seq: row.installment_seq ?? null,
    installment_total: row.installment_total ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    category_name: row.category_name ?? null,
    category_color: row.category_color ?? null,
    category_icon: row.category_icon ?? null,
    account_name: row.account_name ?? null,
    account_color: row.account_color ?? null,
    account_icon: row.account_icon ?? null,
    contact_name: row.contact_name ?? null,
    contact_color: row.contact_color ?? null,
    contact_type: row.contact_type ?? null,
    tags,
  };
}

/** Traduce ExpenseRepository::buildWhere. I trasferimenti non compaiono mai. */
function buildWhere(userId, f) {
  const clauses = ['e.user_id = ?', 'e.is_transfer = 0'];
  const params = [userId];

  const add = (clause, value) => { clauses.push(clause); params.push(value); };

  if (f.date_from && isValidDate(f.date_from)) add('e.expense_date >= ?', f.date_from);
  if (f.date_to && isValidDate(f.date_to)) add('e.expense_date <= ?', f.date_to);
  if (f.category_id) add('e.category_id = ?', int(f.category_id));
  if (f.account_id) add('e.account_id = ?', int(f.account_id));
  if (f.contact_id) add('e.contact_id = ?', int(f.contact_id));
  if (f.amount_min !== undefined && f.amount_min !== '' && f.amount_min !== null) {
    add('e.amount >= ?', Number(f.amount_min) || 0);
  }
  if (f.amount_max !== undefined && f.amount_max !== '' && f.amount_max !== null) {
    add('e.amount <= ?', Number(f.amount_max) || 0);
  }
  if (f.search) add('e.description LIKE ?', `%${f.search}%`);
  if (f.tag) {
    add(`EXISTS (
      SELECT 1 FROM expense_tags et2
      INNER JOIN tags t2 ON t2.id = et2.tag_id
      WHERE et2.expense_id = e.id AND t2.user_id = e.user_id AND t2.name = ?
    )`, str(f.tag));
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

/** Tag di piu' spese in una query sola, come tagsForExpenses. */
function tagsForExpenses(ids, userId) {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT et.expense_id, t.id, t.name, t.color
     FROM expense_tags et
     INNER JOIN tags t ON t.id = et.tag_id
     WHERE et.expense_id IN (${placeholders}) AND t.user_id = ?
     ORDER BY t.name ASC`,
    ...ids, userId,
  );
  const byExpense = new Map();
  for (const r of rows) {
    if (!byExpense.has(r.expense_id)) byExpense.set(r.expense_id, []);
    byExpense.get(r.expense_id).push({ id: r.id, name: r.name, color: r.color });
  }
  return byExpense;
}

/** Conteggio e totale del gruppo di rate, per il badge nella riga. */
function installmentGroupSummary(userId, ids) {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT e.id,
            COALESCE(e.parent_expense_id, e.id) AS group_id,
            (SELECT COUNT(*) FROM expenses x
              WHERE x.user_id = e.user_id
                AND COALESCE(x.parent_expense_id, x.id) = COALESCE(e.parent_expense_id, e.id)) AS group_count,
            (SELECT ROUND(SUM(${inBase("x")}), 2) FROM expenses x
              WHERE x.user_id = e.user_id
                AND COALESCE(x.parent_expense_id, x.id) = COALESCE(e.parent_expense_id, e.id)) AS group_total
     FROM expenses e
     WHERE e.user_id = ? AND e.id IN (${placeholders})`,
    userId, ...ids,
  );
  return new Map(rows.map((r) => [r.id, { group_count: r.group_count, group_total: money(r.group_total) }]));
}

const findById = (id, userId) => {
  const row = one(`SELECT ${SELECT_COLUMNS} ${JOINS} WHERE e.id = ? AND e.user_id = ? LIMIT 1`, id, userId);
  if (!row) return null;
  return toPublic(row, tagsForExpenses([row.id], userId).get(row.id) ?? []);
};

const ownedExists = (userId, table, id) =>
  Boolean(one(`SELECT 1 AS x FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`, id, userId));


/** Traduce ExpenseService::normalizeAndValidate. */
function normalizeAndValidate(userId, data) {
  const amount = parseAmountLikePhp(data.amount);
  if (amount < 0.01 || amount > 99999999.99) {
    throw HttpError.badRequest('Importo non valido (minimo 0.01, massimo 99999999.99).');
  }

  const payment = str(data.payment_method) || 'card';
  if (!PAYMENT_METHODS.includes(payment)) throw HttpError.badRequest('Metodo di pagamento non valido.');

  const expenseDate = str(data.expense_date);
  if (!isValidDate(expenseDate)) {
    throw HttpError.badRequest('Data non valida (formato richiesto: YYYY-MM-DD).');
  }

  let description = data.description === undefined || data.description === null ? null : str(data.description);
  if (description === '') description = null;
  if (description !== null && [...description].length > 8192) {
    throw HttpError.badRequest('Descrizione troppo lunga (max 8192 caratteri).');
  }

  const categoryId = nullableInt(data.category_id);
  if (categoryId !== null && !ownedExists(userId, 'categories', categoryId)) {
    throw HttpError.badRequest('Categoria non trovata.');
  }

  const contactId = nullableInt(data.contact_id);
  if (contactId !== null && !ownedExists(userId, 'contacts', contactId)) {
    throw HttpError.badRequest('Anagrafica non trovata.');
  }

  const accountId = nullableInt(data.account_id);
  let accountType = null;
  if (accountId !== null) {
    const row = one('SELECT type FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', accountId, userId);
    if (!row) throw HttpError.badRequest('Conto non trovato.');
    accountType = row.type;
  }

  if (payment === 'cash') {
    if (accountId === null) {
      throw HttpError.badRequest('Per i pagamenti in contanti devi selezionare un conto cassa.');
    }
    if (accountType !== 'cash') {
      throw HttpError.badRequest('Il conto selezionato non e\' un conto cassa: scegli "In tasca" o un altro conto Contanti.');
    }
  }

  let sharedWith = data.shared_with === undefined || data.shared_with === null ? null : str(data.shared_with);
  if (sharedWith === '') sharedWith = null;
  if (sharedWith !== null && [...sharedWith].length > 255) {
    throw HttpError.badRequest('Lista "Condiviso con" troppo lunga.');
  }

  let shareAmount = null;
  const shareRaw = data.share_amount;
  if (shareRaw !== null && shareRaw !== undefined && shareRaw !== '') {
    const share = Number(shareRaw);
    if (!Number.isFinite(share) || share < 0.01) throw HttpError.badRequest('Quota personale non valida.');
    if (share > amount) throw HttpError.badRequest("La tua quota non puo' superare il totale.");
    shareAmount = share.toFixed(2);
  }

  return {
    category_id: categoryId,
    contact_id: contactId,
    account_id: accountId,
    amount: amount.toFixed(2),
    description,
    shared_with: sharedWith,
    share_amount: shareAmount,
    payment_method: payment,
    expense_date: expenseDate,
  };
}

/**
 * Il form permette di scrivere il nome di un fornitore che non e' ancora in
 * rubrica: in quel caso l'anagrafica viene creata al volo, come fa
 * ExpenseService::resolveContact.
 */
function resolveContact(userId, data) {
  if (nullableInt(data.contact_id)) return data;
  const name = str(data.contact_name);
  return { ...data, contact_id: name === '' ? null : findOrCreateContact(userId, name) };
}

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const filters = {
    date_from: str(searchParams.get('date_from')),
    date_to: str(searchParams.get('date_to')),
    category_id: nullableInt(searchParams.get('category_id')),
    account_id: nullableInt(searchParams.get('account_id')),
    contact_id: nullableInt(searchParams.get('contact_id')),
    amount_min: searchParams.get('amount_min'),
    amount_max: searchParams.get('amount_max'),
    search: str(searchParams.get('search')),
    tag: str(searchParams.get('tag')),
  };
  const limit = Math.max(1, Math.min(500, int(searchParams.get('limit'), 200)));
  const offset = Math.max(0, int(searchParams.get('offset'), 0));

  const { where, params } = buildWhere(userId, filters);
  const rows = all(
    `SELECT ${SELECT_COLUMNS} ${JOINS} ${where}
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    ...params,
  );
  const total = one(`SELECT COUNT(*) AS n ${JOINS} ${where}`, ...params).n;

  const tags = tagsForExpenses(rows.map((r) => r.id), userId);
  const expenses = rows.map((r) => toPublic(r, tags.get(r.id) ?? []));

  const withInstallments = expenses.filter((e) => e.installment_total > 0).map((e) => e.id);
  if (withInstallments.length > 0) {
    const summary = installmentGroupSummary(userId, withInstallments);
    for (const e of expenses) {
      const info = summary.get(e.id);
      if (info) {
        e.installment_group_count = info.group_count;
        e.installment_group_total = info.group_total;
      }
    }
  }

  ok(res, { expenses, total, limit, offset });
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  // La rateizzazione resta a PHP finche' InstallmentCalculator non e' migrato.
  if (int(body.installment_count) > 1 || (body.installment && int(body.installment.count) > 1)) {
    throw HttpError.badRequest('La rateizzazione non e\' ancora disponibile da questo percorso.');
  }

  const row = normalizeAndValidate(userId, resolveContact(userId, body));

  const id = transaction(() => {
    const result = run(
      `INSERT INTO expenses
         (user_id, category_id, contact_id, account_id, amount, description,
          shared_with, share_amount, payment_method, expense_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, row.category_id, row.contact_id, row.account_id, row.amount, row.description,
      row.shared_with, row.share_amount, row.payment_method, row.expense_date,
    );
    return Number(result.lastInsertRowid);
  });

  ok(res, {
    expense: findById(id, userId),
    budget_warning: checkForCategory(userId, row.category_id, row.expense_date.slice(0, 7)),
  });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !ownedExists(userId, 'expenses', id)) throw HttpError.notFound('Spesa non trovata.');

  const row = normalizeAndValidate(userId, resolveContact(userId, body));

  transaction(() => {
    run(
      `UPDATE expenses
       SET category_id = ?, contact_id = ?, account_id = ?, amount = ?, description = ?,
           shared_with = ?, share_amount = ?, payment_method = ?, expense_date = ?
       WHERE id = ? AND user_id = ?`,
      row.category_id, row.contact_id, row.account_id, row.amount, row.description,
      row.shared_with, row.share_amount, row.payment_method, row.expense_date, id, userId,
    );
  });

  ok(res, {
    expense: findById(id, userId),
    budget_warning: checkForCategory(userId, row.category_id, row.expense_date.slice(0, 7)),
  });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID spesa mancante.');
  if (!ownedExists(userId, 'expenses', id)) throw HttpError.notFound('Spesa non trovata.');

  // Tag e allegati spariscono da soli: FK ON DELETE CASCADE.
  run('DELETE FROM expenses WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { id });
}

export const expenseRoutes = {
  'GET /expenses/list': list,
  'POST /expenses/create': create,
  'POST /expenses/update': update,
  'POST /expenses/delete': remove,
};
