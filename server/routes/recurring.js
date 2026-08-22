// Spese ricorrenti — contratto identico a RecurringController +
// App\RecurringExpense.
//
// generatePending() gira a ogni apertura della dashboard: e' idempotente
// grazie a last_generated_date, che avanza solo fino a oggi.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp } from '../amount.js';
import { findOrCreate as findOrCreateContact } from './contacts.js';

const FREQUENCIES = ['weekly', 'monthly', 'yearly'];
const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Avanza una data di un periodo, riproducendo il comportamento di
 * DateTimeImmutable::modify() di PHP — compreso lo sbordo di fine mese:
 * il 31 gennaio + 1 mese diventa il 3 marzo, non il 28 febbraio.
 * Verificato identico fra PHP e JS anche negli anni bisestili.
 */
export function avanza(dateStr, frequency) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else throw HttpError.badRequest('Frequenza non valida.');
  return d.toISOString().slice(0, 10);
}

const LIST_SQL = `
  SELECT r.id, r.user_id, r.category_id, r.contact_id, r.amount, r.description,
         r.payment_method, r.frequency, r.start_date, r.end_date,
         r.last_generated_date, r.active, r.created_at, r.updated_at,
         c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
         co.name AS contact_name, co.color AS contact_color, co.type AS contact_type
  FROM recurring_expenses r
  LEFT JOIN categories c  ON c.id  = r.category_id
  LEFT JOIN contacts   co ON co.id = r.contact_id`;

const listForUser = (userId) => all(
  `${LIST_SQL} WHERE r.user_id = ? ORDER BY r.active DESC, r.frequency, r.description`, userId,
);

const findForUser = (id, userId) =>
  one('SELECT * FROM recurring_expenses WHERE id = ? AND user_id = ? LIMIT 1', id, userId);

const nullableInt = (raw) => {
  if (raw === null || raw === undefined || raw === '' || raw === '0' || raw === 0) return null;
  return int(raw);
};

const ownedExists = (userId, table, id) =>
  Boolean(one(`SELECT 1 AS x FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`, id, userId));

/** Un fornitore scritto a mano e non ancora in rubrica viene creato al volo. */
function resolveContact(userId, data) {
  if (nullableInt(data.contact_id)) return data;
  const name = str(data.contact_name);
  return { ...data, contact_id: name === '' ? null : findOrCreateContact(userId, name) };
}

/** Traduce RecurringExpense::validate. */
function validate(userId, data) {
  const amount = parseAmountLikePhp(data.amount);
  if (amount < 0.01 || amount > 99999999.99) throw HttpError.badRequest('Importo non valido.');

  const payment = str(data.payment_method) || 'card';
  if (!PAYMENT_METHODS.includes(payment)) throw HttpError.badRequest('Metodo di pagamento non valido.');

  const frequency = str(data.frequency) || 'monthly';
  if (!FREQUENCIES.includes(frequency)) {
    throw HttpError.badRequest('Frequenza non valida (weekly/monthly/yearly).');
  }

  const startDate = str(data.start_date);
  if (!isValidDate(startDate)) throw HttpError.badRequest('Data inizio non valida.');

  let endDate = str(data.end_date) || null;
  if (endDate !== null) {
    if (!isValidDate(endDate)) throw HttpError.badRequest('Data fine non valida.');
    if (endDate < startDate) {
      throw HttpError.badRequest('La data fine deve essere successiva alla data inizio.');
    }
  }

  let description = data.description === undefined || data.description === null ? null : str(data.description);
  if (description === '') description = null;

  const categoryId = nullableInt(data.category_id);
  if (categoryId !== null && !ownedExists(userId, 'categories', categoryId)) {
    throw HttpError.badRequest('Categoria non trovata.');
  }
  const contactId = nullableInt(data.contact_id);
  if (contactId !== null && !ownedExists(userId, 'contacts', contactId)) {
    throw HttpError.badRequest('Anagrafica non trovata.');
  }

  return {
    category_id: categoryId,
    contact_id: contactId,
    amount: amount.toFixed(2),
    description,
    payment_method: payment,
    frequency,
    start_date: startDate,
    end_date: endDate,
  };
}

/**
 * Materializza le occorrenze arretrate fino a oggi. Idempotente: riparte da
 * last_generated_date, che viene aggiornata solo se qualcosa e' stato creato.
 */
export function generatePending(userId) {
  const templates = all(
    `SELECT id, category_id, contact_id, amount, description, payment_method, frequency,
            start_date, end_date, last_generated_date
     FROM recurring_expenses WHERE user_id = ? AND active = 1`,
    userId,
  );
  const today = today();
  let created = 0;

  transaction(() => {
    for (const t of templates) {
      let cursor = t.last_generated_date === null
        ? t.start_date
        : avanza(t.last_generated_date, t.frequency);
      let last = null;

      while (cursor <= today && (t.end_date === null || cursor <= t.end_date)) {
        run(
          `INSERT INTO expenses
             (user_id, category_id, contact_id, amount, description, payment_method, expense_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          userId, t.category_id, t.contact_id, t.amount, t.description, t.payment_method, cursor,
        );
        created++;
        last = cursor;
        cursor = avanza(cursor, t.frequency);
      }

      if (last !== null) {
        run('UPDATE recurring_expenses SET last_generated_date = ? WHERE id = ? AND user_id = ?',
          last, t.id, userId);
      }
    }
  });

  return created;
}

async function list(req, res) {
  ok(res, { items: listForUser(currentUserId()) });
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const row = validate(userId, resolveContact(userId, body));
  const result = run(
    `INSERT INTO recurring_expenses
       (user_id, category_id, contact_id, amount, description, payment_method,
        frequency, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, row.category_id, row.contact_id, row.amount, row.description,
    row.payment_method, row.frequency, row.start_date, row.end_date,
  );
  ok(res, { recurring: findForUser(Number(result.lastInsertRowid), userId) });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID ricorrenza mancante.');
  if (!findForUser(id, userId)) throw HttpError.notFound('Ricorrenza non trovata.');

  const row = validate(userId, resolveContact(userId, body));
  run(
    `UPDATE recurring_expenses
     SET category_id = ?, contact_id = ?, amount = ?, description = ?, payment_method = ?,
         frequency = ?, start_date = ?, end_date = ?
     WHERE id = ? AND user_id = ?`,
    row.category_id, row.contact_id, row.amount, row.description, row.payment_method,
    row.frequency, row.start_date, row.end_date, id, userId,
  );
  ok(res, { recurring: findForUser(id, userId) });
}

async function toggle(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID ricorrenza mancante.');
  if (!findForUser(id, userId)) throw HttpError.notFound('Ricorrenza non trovata.');

  const active = int(body.active) === 1 ? 1 : 0;
  run('UPDATE recurring_expenses SET active = ? WHERE id = ? AND user_id = ?', active, id, userId);
  ok(res, { id, active: active === 1 });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID ricorrenza mancante.');
  if (!findForUser(id, userId)) throw HttpError.notFound('Ricorrenza non trovata.');

  // Le spese gia' generate restano: sono movimenti veri.
  run('DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { id });
}

async function run_(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  ok(res, { created: generatePending(currentUserId()) });
}

export const recurringRoutes = {
  'GET /recurring/list': list,
  'POST /recurring/create': create,
  'POST /recurring/update': update,
  'POST /recurring/toggle': toggle,
  'POST /recurring/delete': remove,
  'POST /recurring/run': run_,
};
