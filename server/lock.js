/**
 * Il cancello: finche' non si sblocca, il database non e' aperto e l'app non ha
 * niente da mostrare.
 *
 * La chiave sta qui, in memoria e in memoria soltanto, per il tempo in cui
 * l'app resta aperta. Chiusa l'app, per rientrare serve di nuovo la password.
 *
 * La schermata di sblocco e' una pagina dell'app come le altre: il server parte
 * prima che il database sia apribile e serve solo quella. Cosi' Electron non ha
 * bisogno di una finestra a parte, di un preload o di un canale IPC — che oggi
 * non esistono — e `npm start` nel browser continua a funzionare uguale.
 */

import { copyFileSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';

import * as vault from './vault.js';
import { apri, chiudi, databasePath, db, one } from './db.js';
import { migrate } from '../database/migrate.js';

let chiave = null;
/**
 * `stato()` gira a ogni richiesta, e a database aperto la risposta non cambia
 * piu': una volta arrivati a «aperto» non serve rifare la domanda al database
 * per ogni immagine e ogni chiamata.
 */
let configurato = false;

/** Un database non cifrato comincia con questa firma; uno cifrato no. */
function inChiaro(file) {
  if (!existsSync(file) || statSync(file).size === 0) return false;
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    readSync(fd, buf, 0, 16, 0);
    return buf.toString('latin1').startsWith('SQLite format 3');
  } finally {
    closeSync(fd);
  }
}

/**
 * Dove siamo.
 *
 *  - `nuovo`         niente vault, niente database: primo avvio in assoluto
 *  - `da-proteggere` database in chiaro di una versione precedente, da cifrare
 *  - `chiuso`        c'e' tutto, manca la password
 *  - `da-configurare` sbloccato, ma la procedura di benvenuto non e' finita
 *  - `aperto`        si lavora
 */
export function stato() {
  if (chiave) {
    if (configurato) return 'aperto';
    configurato = Boolean(one('SELECT id FROM users ORDER BY id LIMIT 1'));
    return configurato ? 'aperto' : 'da-configurare';
  }
  if (vault.esiste()) return 'chiuso';
  return inChiaro(databasePath()) ? 'da-proteggere' : 'nuovo';
}

export const sbloccato = () => chiave !== null;

/** La chiave, per chi deve rifare un incarto (cambio password, chiave di recupero). */
export function chiaveCorrente() {
  if (!chiave) throw new Error('Il database non e\' stato sbloccato.');
  return chiave;
}

/** Apre il database con la chiave data e lo porta alla versione attesa. */
function avvia(dek) {
  chiave = dek;
  try {
    apri(dek);
    migrate(db());
  } catch (err) {
    // Aperto a meta' non serve a nessuno: si torna chiusi, cosi' il prossimo
    // tentativo riparte pulito invece di trovarsi una connessione monca.
    chiave = null;
    chiudi();
    throw err;
  }
}

/**
 * Sblocca con la password o con la chiave di recupero.
 *
 * @returns {'password'|'recupero'|null} con che cosa e' entrato, `null` se non apre
 */
export function sblocca(segreto) {
  if (chiave) return 'password';
  const aperto = vault.apri(segreto);
  if (!aperto) return null;
  avvia(aperto.dek);
  return aperto.con;
}

/**
 * Crea la protezione al primo avvio: chiavi nuove, database nuovo.
 *
 * @returns {string} la chiave di recupero, da mostrare **subito e una volta sola**
 */
export function proteggiNuovo(password) {
  if (vault.esiste()) throw new Error('La protezione e\' gia\' stata creata.');
  const { dek, chiaveRecupero } = vault.crea(password);
  avvia(dek);
  return chiaveRecupero;
}

/**
 * Cifra un database che esiste gia' in chiaro.
 *
 * L'ordine e' quello che e' per ragioni precise:
 *  - la copia di sicurezza per prima, perche' e' l'unica cosa che ci salva se
 *    il resto va storto a meta';
 *  - `journal_mode = DELETE`, perche' SQLite si rifiuta di cifrare un database
 *    aperto in WAL (e il WAL, che il rekey non tocca, resterebbe leggibile);
 *  - il vault **per ultimo**, a verifica passata: se lo scrivessimo prima e la
 *    cifratura fallisse, al riavvio l'app cercherebbe di aprire con una chiave
 *    un database che quella chiave non ha.
 *
 * @returns {string} la chiave di recupero
 */
export function cifraEsistente(password) {
  if (vault.esiste()) throw new Error('Il database e\' gia\' protetto.');
  const file = databasePath();
  if (!inChiaro(file)) throw new Error('Non c\'e\' nessun database in chiaro da cifrare.');

  const copia = `${file}.prima-della-cifratura`;
  if (!existsSync(copia)) copyFileSync(file, copia);

  // Conversione vera e propria. `apri(null)` = senza chiave: il database e'
  // ancora in chiaro, e la chiave e' quella che gli daremo fra un istante.
  const grezzo = apri(null);
  const primaDi = grezzo.prepare("SELECT count(*) n FROM sqlite_master WHERE type = 'table'").get().n;
  grezzo.pragma('journal_mode = DELETE');

  const nuove = vault.componi(password);
  try {
    grezzo.pragma(`rekey = "x'${nuove.dek.toString('hex')}'"`);
  } catch (err) {
    chiudi();
    throw new Error(`La cifratura non e' riuscita: ${err.message}. `
      + `I dati sono al sicuro, la copia di prima e' in ${copia}.`, { cause: err });
  }
  chiudi();

  // Verifica: si riapre con la chiave nuova e si controlla che ci sia ancora
  // tutto.
  chiave = nuove.dek;
  const riaperto = apri(nuove.dek);
  const dopo = riaperto.prepare("SELECT count(*) n FROM sqlite_master WHERE type = 'table'").get().n;
  if (dopo < primaDi) {
    blocca();
    throw new Error(`Dopo la cifratura mancano delle tabelle. La copia di prima e' in ${copia}.`);
  }

  // Il vault **subito qui**: da questo momento il database sul disco e' cifrato
  // e senza queste chiavi non lo apre piu' nessuno. Se rimandassimo a dopo la
  // migrate, un errore li' in mezzo lascerebbe un database cifrato con una
  // chiave che non esiste in nessun posto.
  vault.salva(nuove.dati);

  migrate(riaperto);
  return nuove.chiaveRecupero;
}

/** Dov'e' finita la copia in chiaro, se c'e' ancora. */
export function copiaInChiaro() {
  const copia = `${databasePath()}.prima-della-cifratura`;
  return existsSync(copia) ? copia : null;
}

/** Chiude tutto: la chiave sparisce dalla memoria. */
export function blocca() {
  chiave = null;
  configurato = false;
  chiudi();
}
