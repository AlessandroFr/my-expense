// Categorie — primo dominio passato a Node.
// Contratto identico a CategoryController + CategoryService: stesse chiavi,
// stessi messaggi d'errore, stesso envelope.

import { all, one, run, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';

const COLUMNS = 'id, user_id, name, color, icon, sort_order, created_at, updated_at';

/** Stesso ordinamento di CategoryRepository::listForUser. */
export const listForUser = (userId) =>
  all(`SELECT ${COLUMNS} FROM categories WHERE user_id = ? ORDER BY sort_order ASC, name ASC`, userId);

const findById = (id, userId) =>
  one(`SELECT ${COLUMNS} FROM categories WHERE id = ? AND user_id = ? LIMIT 1`, id, userId);

/** Traduce CategoryService::normalize, messaggi d'errore compresi. */
export function normalize(data) {
  const name = str(data.name);
  if (name === '' || [...name].length > 64) {
    throw HttpError.badRequest("Il nome e' obbligatorio (max 64 caratteri).");
  }

  let color = str(data.color) || '#6c757d';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw HttpError.badRequest('Colore non valido. Usa un hex tipo #0d6efd.');
  }
  color = color.toLowerCase();

  let icon = data.icon === undefined || data.icon === null ? null : str(data.icon);
  if (icon === '') icon = null;
  if (icon !== null && [...icon].length > 32) {
    throw HttpError.badRequest('Nome icona troppo lungo (max 32 caratteri).');
  }

  return { name, color, icon, sort_order: int(data.sort_order, 0) };
}

/** L'UNIQUE su (user_id, name) diventa il messaggio che l'utente vede. */
function insert(userId, row) {
  try {
    const res = run(
      'INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
      userId, row.name, row.color, row.icon, row.sort_order,
    );
    return Number(res.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      throw HttpError.conflict(`Esiste gia' una categoria con il nome '${row.name}'.`);
    }
    throw err;
  }
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();
  const id = insert(userId, normalize(body));
  ok(res, { category: findById(id, userId) });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findById(id, userId)) throw HttpError.notFound('Categoria non trovata.');

  const row = normalize(body);
  try {
    run(
      'UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ? WHERE id = ? AND user_id = ?',
      row.name, row.color, row.icon, row.sort_order, id, userId,
    );
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      throw HttpError.conflict(`Esiste gia' una categoria con il nome '${row.name}'.`);
    }
    throw err;
  }
  ok(res, { category: findById(id, userId) });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID categoria mancante.');
  if (!findById(id, userId)) throw HttpError.notFound('Categoria non trovata.');

  // Le spese collegate restano: la FK e' ON DELETE SET NULL.
  run('DELETE FROM categories WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { id });
}

export const categoryRoutes = {
  'POST /categories/create': create,
  'POST /categories/update': update,
  'POST /categories/delete': remove,
};
