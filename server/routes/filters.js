// Filtri salvati — contratto identico a FilterController + SavedFilterService.

import { all, one, run, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';

/** Come l'Entity SavedFilter, il payload esce decodificato, non come stringa. */
function toPublic(row) {
  let payload = [];
  try {
    const parsed = JSON.parse(row.payload);
    if (parsed && typeof parsed === 'object') payload = parsed;
  } catch {
    payload = [];
  }
  return { id: row.id, scope: row.scope, name: row.name, payload, created_at: row.created_at };
}

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const scope = str(searchParams.get('scope')) || 'expenses';
  const rows = all(
    `SELECT id, scope, name, payload, created_at
     FROM saved_filters WHERE user_id = ? AND scope = ? ORDER BY name ASC`,
    currentUserId(), scope,
  );
  ok(res, { filters: rows.map(toPublic) });
}

async function save(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const name = str(body.name);
  if (name === '' || [...name].length > 64) {
    throw HttpError.badRequest('Nome filtro obbligatorio (max 64 caratteri).');
  }
  const scope = str(body.scope) || 'expenses';
  if ([...scope].length > 32) throw HttpError.badRequest('Scope troppo lungo.');

  // Il payload arriva come stringa JSON dal frontend, ma si accetta anche un
  // oggetto gia' strutturato. Qualsiasi altra cosa diventa un payload vuoto.
  let payload = body.payload ?? null;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      payload = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      payload = {};
    }
  } else if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  run(
    `INSERT INTO saved_filters (user_id, scope, name, payload) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, scope, name) DO UPDATE SET payload = excluded.payload`,
    userId, scope, name, JSON.stringify(payload),
  );

  // Dopo un upsert lastInsertRowid non e' attendibile (su UPDATE resta quello
  // di prima): l'id si rilegge dalle colonne che formano il vincolo UNIQUE.
  const row = one(
    'SELECT id FROM saved_filters WHERE user_id = ? AND scope = ? AND name = ?',
    userId, scope, name,
  );
  ok(res, { id: row?.id ?? 0 });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID filtro mancante.');

  run('DELETE FROM saved_filters WHERE id = ? AND user_id = ?', id, currentUserId());
  ok(res, { deleted: true });
}

export const filterRoutes = {
  'GET /filters/list': list,
  'POST /filters/save': save,
  'POST /filters/delete': remove,
};
