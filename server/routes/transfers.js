// Trasferimenti fra conti — contratto identico a TransferController +
// TransferService.
//
// Un trasferimento non e' una riga sola: e' una riga in `transfers` piu' una
// spesa sul conto sorgente e un'entrata su quello destinazione, entrambe con
// is_transfer=1. Le tre scritture stanno in una transazione unica, altrimenti
// un saldo resterebbe sbagliato.
//
// Resta a PHP /transfers/backfill-imported, che riconosce i trasferimenti
// dentro i movimenti gia' importati dalla banca: appartiene all'importer.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp } from '../amount.js';
import { transfersCategoryId } from './categories.js';

const INCOME_SOURCE = 'Trasferimento';

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));

const SELECT_COLUMNS = `
  t.id, t.user_id, t.source_account_id, t.destination_account_id,
  t.amount, t.transfer_date, t.description, t.notes, t.created_at, t.updated_at,
  s.name AS source_name, s.color AS source_color, s.icon AS source_icon,
  d.name AS destination_name, d.color AS destination_color, d.icon AS destination_icon`;

const JOINS = `
  FROM transfers t
  INNER JOIN accounts s ON s.id = t.source_account_id
  INNER JOIN accounts d ON d.id = t.destination_account_id`;

/** Serializzazione identica a Transfer::toArray. */
const toPublic = (row) => ({
  id: row.id,
  user_id: row.user_id,
  source_account_id: row.source_account_id,
  destination_account_id: row.destination_account_id,
  amount: money(row.amount),
  transfer_date: row.transfer_date,
  description: row.description ?? null,
  notes: row.notes ?? null,
  created_at: row.created_at ?? null,
  updated_at: row.updated_at ?? null,
  source_name: row.source_name ?? null,
  source_color: row.source_color ?? null,
  source_icon: row.source_icon ?? null,
  destination_name: row.destination_name ?? null,
  destination_color: row.destination_color ?? null,
  destination_icon: row.destination_icon ?? null,
});

function buildWhere(userId, f) {
  const clauses = ['t.user_id = ?'];
  const params = [userId];
  const add = (clause, ...values) => { clauses.push(clause); params.push(...values); };

  if (f.date_from && isValidDate(f.date_from)) add('t.transfer_date >= ?', f.date_from);
  if (f.date_to && isValidDate(f.date_to)) add('t.transfer_date <= ?', f.date_to);
  if (f.account_id) add('(t.source_account_id = ? OR t.destination_account_id = ?)', int(f.account_id), int(f.account_id));

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

const findById = (id, userId) => {
  const row = one(`SELECT ${SELECT_COLUMNS} ${JOINS} WHERE t.id = ? AND t.user_id = ? LIMIT 1`, id, userId);
  return row ? toPublic(row) : null;
};

/** Traduce TransferService::normalize. */
function normalize(userId, data) {
  const sourceId = int(data.source_account_id);
  const destId = int(data.destination_account_id);
  if (sourceId <= 0 || destId <= 0) {
    throw HttpError.badRequest('Devi selezionare conto sorgente e destinazione.');
  }
  if (sourceId === destId) {
    throw HttpError.badRequest('Conto sorgente e destinazione non possono coincidere.');
  }

  const source = one('SELECT name FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', sourceId, userId);
  const dest = one('SELECT name FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', destId, userId);
  if (!source || !dest) throw HttpError.badRequest('Conto non trovato.');

  const amount = parseAmountLikePhp(data.amount);
  if (amount < 0.01 || amount > 99999999.99) {
    throw HttpError.badRequest('Importo non valido (minimo 0.01).');
  }

  const date = str(data.transfer_date);
  if (!isValidDate(date)) throw HttpError.badRequest('Data non valida (formato YYYY-MM-DD).');

  const text = (raw, label) => {
    let v = raw === undefined || raw === null ? null : str(raw);
    if (v === '') v = null;
    if (v !== null && [...v].length > 255) throw HttpError.badRequest(label);
    return v;
  };

  return {
    source_account_id: sourceId,
    destination_account_id: destId,
    amount: amount.toFixed(2),
    transfer_date: date,
    description: text(data.description, 'Descrizione troppo lunga (max 255 caratteri).'),
    notes: text(data.notes, 'Note troppo lunghe (max 255 caratteri).'),
    source_name: source.name,
    destination_name: dest.name,
  };
}

/** Le due descrizioni mostrate sulle righe collegate. */
const descrizioni = (row) => ({
  expense: row.description
    ? `Trasferimento verso ${row.destination_name} — ${row.description}`
    : `Trasferimento verso ${row.destination_name}`,
  income: row.description
    ? `Trasferimento da ${row.source_name} — ${row.description}`
    : `Trasferimento da ${row.source_name}`,
});

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const filters = {
    date_from: str(searchParams.get('date_from')),
    date_to: str(searchParams.get('date_to')),
    account_id: int(searchParams.get('account_id')) || null,
  };
  const limit = Math.max(1, Math.min(500, int(searchParams.get('limit'), 25)));
  const offset = Math.max(0, int(searchParams.get('offset'), 0));

  const { where, params } = buildWhere(userId, filters);
  const rows = all(
    `SELECT ${SELECT_COLUMNS} ${JOINS} ${where}
     ORDER BY t.transfer_date DESC, t.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    ...params,
  );
  ok(res, {
    transfers: rows.map(toPublic),
    total: one(`SELECT COUNT(*) AS n FROM transfers t ${where}`, ...params).n,
  });
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const row = normalize(userId, body);
  const texts = descrizioni(row);

  const id = transaction(() => {
    const result = run(
      `INSERT INTO transfers
         (user_id, source_account_id, destination_account_id, amount, transfer_date, description, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId, row.source_account_id, row.destination_account_id,
      row.amount, row.transfer_date, row.description, row.notes,
    );
    const transferId = Number(result.lastInsertRowid);
    const categoryId = transfersCategoryId(userId);

    run(
      `INSERT INTO expenses
         (user_id, category_id, account_id, amount, description, payment_method,
          expense_date, is_transfer, transfer_id)
       VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1, ?)`,
      userId, categoryId, row.source_account_id, row.amount, texts.expense, row.transfer_date, transferId,
    );
    run(
      `INSERT INTO incomes
         (user_id, account_id, source, description, amount, payment_method,
          income_date, is_transfer, transfer_id)
       VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1, ?)`,
      userId, row.destination_account_id, INCOME_SOURCE, texts.income,
      row.amount, row.transfer_date, transferId,
    );
    return transferId;
  });

  ok(res, { transfer: findById(id, userId) });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findById(id, userId)) throw HttpError.notFound('Trasferimento non trovato.');

  const row = normalize(userId, body);
  const texts = descrizioni(row);

  transaction(() => {
    run(
      `UPDATE transfers
       SET source_account_id = ?, destination_account_id = ?, amount = ?,
           transfer_date = ?, description = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      row.source_account_id, row.destination_account_id, row.amount,
      row.transfer_date, row.description, row.notes, id, userId,
    );
    // Le righe collegate vanno tenute allineate, altrimenti i saldi dei conti
    // divergono dal trasferimento.
    run(
      `UPDATE expenses SET account_id = ?, amount = ?, description = ?, expense_date = ?
       WHERE user_id = ? AND transfer_id = ?`,
      row.source_account_id, row.amount, texts.expense, row.transfer_date, userId, id,
    );
    run(
      `UPDATE incomes SET account_id = ?, amount = ?, description = ?, income_date = ?
       WHERE user_id = ? AND transfer_id = ?`,
      row.destination_account_id, row.amount, texts.income, row.transfer_date, userId, id,
    );
  });

  ok(res, { transfer: findById(id, userId) });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findById(id, userId)) throw HttpError.notFound('Trasferimento non trovato.');

  // La spesa e l'entrata collegate spariscono da sole: FK ON DELETE CASCADE
  // su transfer_id.
  run('DELETE FROM transfers WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { id });
}

export const transferRoutes = {
  'GET /transfers/list': list,
  'POST /transfers/create': create,
  'POST /transfers/update': update,
  'POST /transfers/delete': remove,
};
