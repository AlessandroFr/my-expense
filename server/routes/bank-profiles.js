// Profili di tracciato degli estratti conto: la parte che tocca il database.
// Il modello (campi, preimpostati, riconoscimento) sta in ../bank-profiles.js.

import { all, one, run, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import {
  AMOUNT_MODES, DATE_ORDERS, DELIMITERS, ENCODINGS, FIELDS,
  builtinProfiles, normalizeHeader,
} from '../bank-profiles.js';

const COLUMNS = `id, user_id, name, builtin_key, delimiter, encoding, amount_mode,
                 date_order, columns_json, notes, sort_order, created_at, updated_at`;

/**
 * Riscrive un profilo com'e' scritto nel codice, `updated_at` compreso: resta
 * «mai modificato», quindi continuera' a riallinearsi agli aggiornamenti.
 */
const applyBuiltin = (id, userId, p) => run(
  `UPDATE bank_profiles
     SET name = ?, delimiter = ?, encoding = ?, amount_mode = ?, date_order = ?,
         columns_json = ?, notes = ?, sort_order = ?, updated_at = created_at
   WHERE id = ? AND user_id = ?`,
  p.name, p.delimiter, p.encoding, p.amount_mode, p.date_order,
  p.columns_json, p.notes, p.sort_order, id, userId,
);

/**
 * I preimpostati nascono qui, non da un INSERT nello schema: su database nuovo
 * le migration vengono solo registrate, quindi una semina SQL non girerebbe
 * mai. Un profilo cancellato a mano rinasce, ma i preimpostati non si possono
 * cancellare: si modificano e si ripristinano.
 */
export function ensureBuiltins(userId) {
  // Un preimpostato mai modificato si riallinea da solo alla definizione di
  // questa versione: e' cosi' che la correzione al tracciato di una banca
  // arriva anche a chi ha gia' il database. Chi l'ha modificato se lo tiene
  // com'e'; per tornare all'originale c'e' «Ripristina».
  const presenti = new Map(
    all(`SELECT id, builtin_key, created_at, updated_at FROM bank_profiles
         WHERE user_id = ? AND builtin_key IS NOT NULL`, userId)
      .map((r) => [r.builtin_key, r]),
  );
  for (const p of builtinProfiles()) {
    const existing = presenti.get(p.builtin_key);
    if (existing) {
      if (existing.updated_at === existing.created_at) applyBuiltin(existing.id, userId, p);
      continue;
    }
    try {
      run(
        `INSERT INTO bank_profiles
           (user_id, name, builtin_key, delimiter, encoding, amount_mode, date_order,
            columns_json, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, p.name, p.builtin_key, p.delimiter, p.encoding, p.amount_mode,
        p.date_order, p.columns_json, p.notes, p.sort_order,
      );
    } catch (err) {
      // Un nome gia' preso da un profilo dell'utente non deve bloccare l'import.
      if (!String(err.message).includes('UNIQUE')) throw err;
    }
  }
}

export function listForUser(userId) {
  ensureBuiltins(userId);
  return all(
    `SELECT ${COLUMNS} FROM bank_profiles WHERE user_id = ? ORDER BY sort_order ASC, name ASC`,
    userId,
  );
}

export const findById = (id, userId) =>
  one(`SELECT ${COLUMNS} FROM bank_profiles WHERE id = ? AND user_id = ? LIMIT 1`, id, userId);

/** Le colonne arrivano dal form come testo a capo o virgole: qui diventano JSON. */
function normalizeColumns(input) {
  const src = typeof input === 'string' ? safeJson(input) : (input ?? {});
  const out = {};
  for (const f of FIELDS) {
    const grezzo = src[f];
    const list = Array.isArray(grezzo)
      ? grezzo
      : String(grezzo ?? '').split(/[\n,;]+/);
    const names = [];
    for (const v of list) {
      const n = normalizeHeader(v);
      if (n !== '' && !names.includes(n)) names.push(n);
    }
    if (names.length > 0) out[f] = names;
  }
  if (out.op_date === undefined) {
    throw HttpError.badRequest('Serve almeno il nome della colonna della data operazione.');
  }
  if (out.amount === undefined && out.outflow === undefined && out.inflow === undefined) {
    throw HttpError.badRequest('Serve la coppia uscite/entrate oppure la colonna dell\'importo con segno.');
  }
  return out;
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };

const uno = (value, allowed, field) => {
  const v = str(value);
  if (!allowed.includes(v)) throw HttpError.badRequest(`Valore non ammesso per ${field}: '${v}'.`);
  return v;
};

function normalize(data) {
  const name = str(data.name);
  if (name === '' || [...name].length > 64) {
    throw HttpError.badRequest("Il nome e' obbligatorio (max 64 caratteri).");
  }
  let notes = str(data.notes);
  if ([...notes].length > 500) notes = [...notes].slice(0, 500).join('');

  return {
    name,
    delimiter: uno(data.delimiter || 'auto', DELIMITERS, 'separatore'),
    encoding: uno(data.encoding || 'auto', ENCODINGS, 'codifica'),
    amount_mode: uno(data.amount_mode || 'auto', AMOUNT_MODES, 'modo importo'),
    date_order: uno(data.date_order || 'auto', DATE_ORDERS, 'ordine delle date'),
    columns_json: JSON.stringify(normalizeColumns(data.columns ?? data.columns_json)),
    notes: notes === '' ? null : notes,
    sort_order: int(data.sort_order, 500),
  };
}

const conflitto = (err, name) => (String(err.message).includes('UNIQUE')
  ? HttpError.conflict(`Esiste gia' un profilo con il nome '${name}'.`)
  : err);

async function list(req, res) {
  ok(res, { profiles: listForUser(currentUserId()) });
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();
  const row = normalize(body);
  let id;
  try {
    const r = run(
      `INSERT INTO bank_profiles
         (user_id, name, builtin_key, delimiter, encoding, amount_mode, date_order,
          columns_json, notes, sort_order)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      userId, row.name, row.delimiter, row.encoding, row.amount_mode,
      row.date_order, row.columns_json, row.notes, row.sort_order,
    );
    id = Number(r.lastInsertRowid);
  } catch (err) { throw conflitto(err, row.name); }
  ok(res, { profile: findById(id, userId) });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0 || !findById(id, userId)) throw HttpError.notFound('Profilo non trovato.');

  const row = normalize(body);
  try {
    run(
      `UPDATE bank_profiles
         SET name = ?, delimiter = ?, encoding = ?, amount_mode = ?, date_order = ?,
             columns_json = ?, notes = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      row.name, row.delimiter, row.encoding, row.amount_mode, row.date_order,
      row.columns_json, row.notes, row.sort_order, id, userId,
    );
  } catch (err) { throw conflitto(err, row.name); }
  ok(res, { profile: findById(id, userId) });
}

/** Rimette un preimpostato com'era appena installato. */
async function reset(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  const current = id > 0 ? findById(id, userId) : null;
  if (!current) throw HttpError.notFound('Profilo non trovato.');
  if (!current.builtin_key) throw HttpError.badRequest('Solo i profili preimpostati si ripristinano.');

  const originale = builtinProfiles().find((p) => p.builtin_key === current.builtin_key);
  if (!originale) throw HttpError.notFound('Questo profilo preimpostato non esiste piu\' in questa versione.');

  applyBuiltin(id, userId, originale);
  ok(res, { profile: findById(id, userId) });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  const profile = id > 0 ? findById(id, userId) : null;
  if (!profile) throw HttpError.notFound('Profilo non trovato.');
  if (profile.builtin_key) {
    throw HttpError.badRequest('Un profilo preimpostato non si cancella: modificalo o ripristinalo.');
  }

  run('DELETE FROM bank_profiles WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { id });
}

export const bankProfileRoutes = {
  'GET /bank-profiles/list': list,
  'POST /bank-profiles/create': create,
  'POST /bank-profiles/update': update,
  'POST /bank-profiles/reset': reset,
  'POST /bank-profiles/delete': remove,
};
