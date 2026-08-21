/**
 * Dove stanno le cose.
 *
 * Ci sono due modi di far girare l'app, e cambiano dove finiscono i dati:
 *
 *  - da sorgente (`avvia.cmd`, `npm start`): tutto accanto al codice, comodo
 *    per lavorarci;
 *  - installata (Electron): i dati stanno nella cartella dell'utente, cosi'
 *    sopravvivono agli aggiornamenti e alla disinstallazione, mentre il codice
 *    sta in sola lettura dentro il pacchetto.
 *
 * Chi avvia decide passando MY_EXPENSE_DATA_DIR; senza, vale la cartella del
 * progetto.
 */

import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La cartella del progetto: contiene il codice e i file statici. */
export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** La cartella dei dati: database, allegati, configurazione, log. */
export const dataRoot = process.env.MY_EXPENSE_DATA_DIR
  ? (isAbsolute(process.env.MY_EXPENSE_DATA_DIR)
    ? process.env.MY_EXPENSE_DATA_DIR
    : join(projectRoot, process.env.MY_EXPENSE_DATA_DIR))
  : projectRoot;

export const publicDir = join(projectRoot, 'public');
export const schemaFile = join(projectRoot, 'database', 'schema.sql');
export const configFile = join(dataRoot, 'config', 'config.json');
export const uploadsRoot = join(dataRoot, 'uploads', 'expenses');

/** Cartella degli allegati di un utente, creata se manca. */
export function uploadsDir(userId, crea = false) {
  const dir = join(uploadsRoot, String(userId));
  if (crea) mkdirSync(dir, { recursive: true });
  return dir;
}
