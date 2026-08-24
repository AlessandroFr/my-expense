// Accesso al database.
//
// Il database e' cifrato (SQLite3MultipleCiphers, schema SQLCipher), quindi non
// si apre da solo: `apri(dek)` va chiamata prima, e la chiave arriva da
// `lock.js`, che l'ha ottenuta dal vault sbloccando con la password.
//
// E' l'unico modulo che sa che la libreria non e' piu' `node:sqlite`: l'API di
// better-sqlite3 e' la stessa (`prepare().all/get/run`, `exec`, `close`), ma un
// database cifrato non lo apre la libreria standard.

import Database from 'better-sqlite3-multiple-ciphers';
import { isAbsolute, join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';

import { configFile, dataRoot } from './paths.js';

/** Percorso del file del database, dalla configurazione locale. */
export function databasePath() {
  let path = 'data/my-expense.sqlite';
  try {
    const cfg = JSON.parse(readFileSync(configFile, 'utf8'));
    if (cfg?.db?.path) path = cfg.db.path;
  } catch {
    // Senza config si usa il percorso predefinito: e' il caso del primo avvio.
  }
  return isAbsolute(path) ? path : join(dataRoot, path);
}

let handle = null;

/**
 * Applica la chiave e i pragma a una connessione appena aperta.
 *
 * L'ordine conta: `key` prima di tutto il resto, perche' finche' non e' stata
 * data qualunque altra istruzione fallisce con «file is not a database».
 */
export function preparaConnessione(conn, dek) {
  if (dek) conn.pragma(`key = "x'${dek.toString('hex')}'"`);
  // Le foreign key in SQLite sono spente di default: senza questa riga i
  // vincoli dello schema non varrebbero.
  conn.exec('PRAGMA foreign_keys = ON');
  conn.exec('PRAGMA journal_mode = WAL');
  return conn;
}

/**
 * Apre il database con la chiave data. Da qui in poi `db()` funziona.
 *
 * @param {Buffer} dek la chiave di cifratura, da `vault.apri()`
 */
export function apri(dek) {
  if (handle) return handle;
  const file = databasePath();
  mkdirSync(join(file, '..'), { recursive: true });
  handle = preparaConnessione(new Database(file), dek);
  return handle;
}

/** Chiude la connessione: la chiave non resta in memoria di SQLite. */
export function chiudi() {
  if (!handle) return;
  handle.close();
  handle = null;
}

export function db() {
  if (!handle) throw new Error('Il database non e\' stato sbloccato.');
  return handle;
}

export const aperto = () => handle !== null;

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
 * Rete di sicurezza: l'utente vero lo crea la procedura di benvenuto, con il
 * nome e la valuta che la persona ha scelto. Questa resta per i casi in cui il
 * database esiste ma quella riga no — un import, un ripristino, un test.
 */
export function ensureUser() {
  const row = one('SELECT id FROM users ORDER BY id LIMIT 1');
  if (row) return row.id;
  const res = run(
    "INSERT INTO users (username, password_hash) VALUES ('io', '')",
  );
  return Number(res.lastInsertRowid);
}
