// Accesso al database. node:sqlite e' nella libreria standard di Node 24:
// nessuna dipendenza, nessun modulo nativo da ricompilare per Electron.

import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Legge il path del database dalla stessa config che usa PHP. */
function databasePath() {
  const raw = readFileSync(join(projectRoot, 'config/config.php'), 'utf8');
  const match = raw.match(/'path'\s*=>\s*'([^']+)'/);
  const path = match ? match[1] : 'data/my-expense.sqlite';
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
 * L'app e' monoutente: la registrazione si chiude dopo il primo utente
 * (src/class/Auth.php), quindi l'id e' sempre lo stesso.
 */
export function currentUserId() {
  const row = one('SELECT id FROM users ORDER BY id LIMIT 1');
  if (!row) throw new Error('Nessun utente: completa prima la registrazione da /setup.');
  return row.id;
}
