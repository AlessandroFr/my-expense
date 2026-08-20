// Accesso al database. node:sqlite e' nella libreria standard di Node 24:
// nessuna dipendenza, nessun modulo nativo da ricompilare per Electron.

import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Percorso del file del database, dalla configurazione locale. */
function databasePath() {
  let path = 'data/my-expense.sqlite';
  try {
    const cfg = JSON.parse(readFileSync(join(projectRoot, 'config/config.json'), 'utf8'));
    if (cfg?.db?.path) path = cfg.db.path;
  } catch {
    // Senza config si usa il percorso predefinito: e' il caso del primo avvio.
  }
  return isAbsolute(path) ? path : join(projectRoot, path);
}

let handle = null;

export function db() {
  if (handle) return handle;
  handle = new DatabaseSync(databasePath());
  // Le foreign key in SQLite sono spente di default: senza questa riga i
  // vincoli dello schema non varrebbero. Stesso motivo in src/class/Database.php.
  handle.exec('PRAGMA foreign_keys = ON');
  handle.exec('PRAGMA journal_mode = WAL');
  return handle;
}

export const all = (sql, ...params) => db().prepare(sql).all(...params);
export const one = (sql, ...params) => db().prepare(sql).get(...params) ?? null;
export const run = (sql, ...params) => db().prepare(sql).run(...params);

/** Esegue fn in transazione, con rollback su eccezione. */
export function transaction(fn) {
  const conn = db();
  conn.exec('BEGIN');
  try {
    const result = fn();
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

/**
 * L'app e' per una persona sola: c'e' una riga sola in `users` e il suo id e'
 * quello di tutti i dati.
 */
export function currentUserId() {
  const row = one('SELECT id FROM users ORDER BY id LIMIT 1');
  if (!row) return ensureUser();
  return row.id;
}

/**
 * Crea l'utente al primo avvio. Non essendoci piu' un login, non c'e' niente da
 * chiedere: serve solo una riga a cui agganciare i dati. Il nome si puo'
 * cambiare dalle impostazioni.
 */
export function ensureUser() {
  const row = one('SELECT id FROM users ORDER BY id LIMIT 1');
  if (row) return row.id;
  const res = run(
    "INSERT INTO users (username, password_hash) VALUES ('io', '')",
  );
  return Number(res.lastInsertRowid);
}
