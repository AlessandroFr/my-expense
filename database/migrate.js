/**
 * Porta il database alla versione attesa, e non fa niente se ci e' gia'.
 *
 * Gira a ogni avvio, e deve poter girare mille volte di fila senza cambiare
 * nulla: e' cosi' che un'installazione gia' esistente riceve le modifiche allo
 * schema quando arriva una versione nuova, invece di restare indietro per
 * sempre come succedeva con l'installer di XAMPP.
 *
 * Due casi:
 *  - database vuoto: si crea da schema.sql, e le migration gia' contenute li'
 *    dentro si segnano come applicate senza rieseguirle;
 *  - database esistente: si applicano, in ordine di nome, solo i file di
 *    database/migrations/ non ancora registrati.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaFile = join(here, 'schema.sql');
const migrationsDir = join(here, 'migrations');

const elencoMigration = () => (existsSync(migrationsDir)
  ? readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  : []);

/**
 * Riceve una connessione **gia' aperta** invece del percorso del file: il
 * database e' cifrato, e aprirlo vuol dire avere la chiave. Quella ce l'ha
 * `lock.js`, non questo modulo.
 *
 * @param {import('better-sqlite3-multiple-ciphers').Database} db connessione aperta
 * @returns {string[]} i nomi delle migration applicate in questa esecuzione
 */
export function migrate(db) {
  // «Nuovo» non e' piu' «il file non c'era»: la connessione e' gia' aperta, e
  // su un database cifrato appena creato il file esiste comunque. Vale invece
  // che non ci sia ancora niente dentro.
  const nuovo = db.prepare(
    "SELECT count(*) n FROM sqlite_master WHERE type = 'table' AND name <> 'schema_migrations'",
  ).get().n === 0;

  const applicate = [];

  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  if (nuovo) {
    db.exec(readFileSync(schemaFile, 'utf8'));
    // schema.sql e' gia' aggiornato all'ultima migration: riapplicarle
    // fallirebbe su tabelle che esistono gia'.
    for (const name of elencoMigration()) {
      db.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(name);
    }
    return applicate;
  }

  const fatte = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  for (const name of elencoMigration()) {
    if (fatte.has(name)) continue;
    // Una migration per transazione: se fallisce a meta', quella resta non
    // applicata e non registrata, quindi il prossimo avvio riprova da li'.
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(migrationsDir, name), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${name}: ${err.message}`, { cause: err });
    }
    applicate.push(name);
  }

  return applicate;
}
