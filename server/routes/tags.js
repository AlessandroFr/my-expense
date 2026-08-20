// Tag — contratto identico a TagController + TagService + TagRepository.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';

/** Elenco con il numero di spese che usano ciascun tag. */
const listForUser = (userId) => all(
  `SELECT t.id, t.name, t.color, t.created_at,
          (SELECT COUNT(*) FROM expense_tags et WHERE et.tag_id = t.id) AS uses
   FROM tags t WHERE t.user_id = ? ORDER BY t.name ASC`,
  userId,
);

const withColorsForExpense = (expenseId, userId) => all(
  `SELECT t.id, t.name, t.color
   FROM tags t
   INNER JOIN expense_tags et ON et.tag_id = t.id
   INNER JOIN expenses    e  ON e.id      = et.expense_id
   WHERE et.expense_id = ? AND e.user_id = ? AND t.user_id = ?
   ORDER BY t.name ASC`,
  expenseId, userId, userId,
);

/**
 * Accetta sia una stringa CSV sia un array, come TagService::setForExpense.
 * I nomi vuoti o troppo lunghi vengono scartati in silenzio (non sono errori:
 * arrivano da un campo a testo libero), e i duplicati che differiscono solo per
 * maiuscole collassano in uno solo, tenendo la prima grafia incontrata.
 */
export function cleanNames(names) {
  const list = Array.isArray(names)
    ? names
    : str(names).split(',');

  const byLower = new Map();
  for (const raw of list) {
    const name = str(raw);
    if (name === '' || [...name].length > 48) continue;
    const key = name.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, name);
  }
  return [...byLower.values()];
}

function setForExpense(expenseId, userId, names) {
  if (!one('SELECT 1 AS x FROM expenses WHERE id = ? AND user_id = ?', expenseId, userId)) {
    throw HttpError.badRequest('Spesa non trovata.');
  }

  const clean = cleanNames(names);

  transaction(() => {
    run('DELETE FROM expense_tags WHERE expense_id = ?', expenseId);
    for (const name of clean) {
      let tag = one('SELECT id FROM tags WHERE user_id = ? AND name = ? LIMIT 1', userId, name);
      if (!tag) {
        const res = run('INSERT INTO tags (user_id, name) VALUES (?, ?)', userId, name);
        tag = { id: Number(res.lastInsertRowid) };
      }
      run('INSERT OR IGNORE INTO expense_tags (expense_id, tag_id) VALUES (?, ?)', expenseId, tag.id);
    }
  });
}

async function list(req, res) {
  ok(res, { tags: listForUser(currentUserId()) });
}

async function assign(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const expenseId = int(body.expense_id);
  if (expenseId <= 0) throw HttpError.badRequest('ID spesa mancante.');

  setForExpense(expenseId, userId, body.names ?? '');
  ok(res, { tags: withColorsForExpense(expenseId, userId) });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID tag mancante.');

  // I collegamenti in expense_tags spariscono da soli: FK ON DELETE CASCADE.
  run('DELETE FROM tags WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { deleted: true });
}

export const tagRoutes = {
  'GET /tags/list': list,
  'POST /tags/assign': assign,
  'POST /tags/delete': remove,
};
