/**
 * Le chiavi che aprono il database.
 *
 * La chiave vera (DEK, 32 byte casuali) non deriva dalla password: viene
 * **incartata due volte**, con la password e con una chiave di recupero. Due
 * conseguenze, che sono il motivo per cui si fa cosi':
 *
 *  - cambiare password rifa' un solo incarto, non ricifra il database (che puo'
 *    essere grande, e a meta' strada sarebbe illeggibile);
 *  - la chiave di recupero apre il database anche senza la password, e non
 *    smette di funzionare quando la password cambia.
 *
 * L'incarto sta in `config/vault.json`, **fuori dal database**: va letto prima
 * di poterlo aprire. Contiene solo roba cifrata, ma non e' un file da
 * condividere e non entra nei backup.
 */

import {
  createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { dataRoot } from './paths.js';

export const vaultFile = join(dataRoot, 'config', 'vault.json');

/**
 * Parametri di scrypt. N alto e' il costo che paga chi prova le password una
 * dopo l'altra: ~0,2 s a tentativo qui, che per noi e' un'attesa impercettibile
 * all'avvio e per chi tira a indovinare sono secoli. `maxmem` va alzato a mano,
 * perche' il valore predefinito di Node non basta per N cosi' grande.
 */
const COSTO = (() => {
  // I test rifanno la derivazione decine di volte e non hanno niente da
  // proteggere: con il costo vero il giro passerebbe da due secondi a mezzo
  // minuto. Quello che provano — quale chiave apre cosa — non dipende da N.
  // Sotto 2^14 non si scende comunque: una variabile d'ambiente sbagliata non
  // deve poter indebolire in silenzio un'installazione vera.
  const richiesto = Number(process.env.MY_EXPENSE_SCRYPT_N);
  return Number.isInteger(richiesto) && richiesto >= 2 ** 14 ? richiesto : 2 ** 17;
})();

const SCRYPT = { N: COSTO, r: 8, p: 1, maxmem: 512 * 1024 * 1024 };
const KEY_LEN = 32;

const deriva = (segreto, salt) => scryptSync(segreto.normalize('NFKC'), salt, KEY_LEN, SCRYPT);

/** Incarta la DEK con una chiave derivata dal segreto. */
function incarta(dek, segreto) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriva(segreto, salt), iv);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

/** Disincarta la DEK, oppure `null` se il segreto e' sbagliato. */
function disincarta(pacco, segreto) {
  if (!pacco) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriva(segreto, Buffer.from(pacco.salt, 'base64')),
      Buffer.from(pacco.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(pacco.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(pacco.ct, 'base64')), decipher.final()]);
  } catch {
    // Il tag GCM non torna: segreto sbagliato, o file manomesso. Da fuori sono
    // la stessa cosa e devono restare indistinguibili.
    return null;
  }
}

/**
 * L'alfabeto della chiave di recupero: niente 0/O/1/I/L, che a ricopiarli da un
 * foglio si scambiano. Chi la legge la sta scrivendo a mano, non copiando.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Una chiave di recupero nuova: 24 caratteri in sei gruppi da quattro. */
export function generaChiaveRecupero() {
  const byte = randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i += 1) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += ALFABETO[byte[i] % ALFABETO.length];
  }
  return out;
}

/**
 * Come viene confrontata una chiave di recupero: chi la ricopia mette i
 * trattini dove gli pare e puo' scriverla in minuscolo, ma sono la stessa
 * chiave. La password invece **non** si normalizza: gli spazi ci stanno
 * apposta.
 */
export const normalizzaChiave = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const esiste = () => existsSync(vaultFile);

function leggi() {
  const dati = JSON.parse(readFileSync(vaultFile, 'utf8'));
  if (dati?.v !== 1) throw new Error(`Formato di ${vaultFile} non riconosciuto.`);
  return dati;
}

/**
 * Scrive il vault senza mai lasciarne uno a meta': un file monco vorrebbe dire
 * database inapribile per sempre.
 */
function scrivi(dati) {
  mkdirSync(dirname(vaultFile), { recursive: true });
  const tmp = `${vaultFile}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(dati, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, vaultFile);
}

/**
 * Prepara le chiavi **senza scriverle**.
 *
 * Separata da `crea()` perche' chi deve cifrare un database che esiste gia' non
 * puo' salvare il vault prima di sapere se la cifratura e' riuscita: un vault
 * scritto in anticipo, dopo un errore a meta', direbbe all'avvio successivo di
 * aprire con una chiave un database che quella chiave non ha.
 *
 * @returns {{dek: Buffer, chiaveRecupero: string, dati: object}} `dati` va poi
 *   passato a `salva()`
 */
export function componi(password) {
  const dek = randomBytes(KEY_LEN);
  const chiaveRecupero = generaChiaveRecupero();
  return {
    dek,
    chiaveRecupero,
    dati: {
      v: 1,
      pw: incarta(dek, password),
      rec: incarta(dek, normalizzaChiave(chiaveRecupero)),
    },
  };
}

export const salva = scrivi;

/**
 * Crea e salva le chiavi al primo avvio.
 *
 * @param {string} password
 * @returns {{dek: Buffer, chiaveRecupero: string}} la chiave di recupero va
 *   mostrata **subito e una volta sola**: da qui in poi non e' piu' leggibile.
 */
export function crea(password) {
  const { dek, chiaveRecupero, dati } = componi(password);
  scrivi(dati);
  return { dek, chiaveRecupero };
}

/**
 * Apre il vault con la password o con la chiave di recupero.
 *
 * Si provano tutti e due gli incarti perche' da fuori non sappiamo quale dei
 * due l'utente abbia scritto, e chiederglielo sarebbe una domanda in piu' senza
 * nessuna utilita'.
 *
 * @returns {{dek: Buffer, con: 'password'|'recupero'}|null} `null` se non apre
 */
export function apri(segreto) {
  const dati = leggi();
  const dek = disincarta(dati.pw, segreto);
  if (dek) return { dek, con: 'password' };

  const conRecupero = disincarta(dati.rec, normalizzaChiave(segreto));
  if (conRecupero) return { dek: conRecupero, con: 'recupero' };

  return null;
}

/** Rifa' l'incarto con la password: quello della chiave di recupero non si tocca. */
export function cambiaPassword(vecchia, nuova) {
  const aperto = apri(vecchia);
  if (!aperto) return false;
  const dati = leggi();
  scrivi({ ...dati, pw: incarta(aperto.dek, nuova) });
  return true;
}

/**
 * Rifa' l'incarto della chiave di recupero e restituisce quella nuova. La
 * vecchia smette di funzionare: e' il punto, si rigenera quando si teme che sia
 * finita sotto gli occhi di qualcun altro.
 */
export function rigeneraChiaveRecupero(dek) {
  const dati = leggi();
  const chiaveRecupero = generaChiaveRecupero();
  scrivi({ ...dati, rec: incarta(dek, normalizzaChiave(chiaveRecupero)) });
  return chiaveRecupero;
}

/**
 * Reincarta una DEK gia' in mano con una password nuova, senza conoscere la
 * vecchia: e' la strada di chi e' entrato con la chiave di recupero e ora
 * **deve** scegliersi una password nuova.
 */
export function impostaPassword(dek, nuova) {
  const dati = esiste() ? leggi() : { v: 1 };
  scrivi({ ...dati, v: 1, pw: incarta(dek, nuova) });
}

/**
 * Cifratura di un file con una password che l'utente sceglie li' per li': non
 * c'e' nessuna DEK di mezzo, il file dev'essere apribile anche su un altro
 * computer dopo una reinstallazione. La usa il backup.
 */
export function cifraConPassword(dati, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriva(password, salt), iv);
  const ct = Buffer.concat([cipher.update(dati), cipher.final()]);
  // Intestazione riconoscibile: chi apre il file per sbaglio deve capire cos'e'
  // invece di vedere byte a caso, e noi dobbiamo poter dire «questo non e' un
  // backup di My Expense» invece di «password sbagliata».
  return Buffer.concat([
    Buffer.from('MXB1'), salt, iv, cipher.getAuthTag(), ct,
  ]);
}

/** L'inverso. Distingue «non e' un backup» da «password sbagliata». */
export function decifraConPassword(buffer, password) {
  if (buffer.length < 48 || buffer.subarray(0, 4).toString() !== 'MXB1') {
    throw new Error('Questo file non e\' un backup di My Expense.');
  }
  const salt = buffer.subarray(4, 20);
  const iv = buffer.subarray(20, 32);
  const tag = buffer.subarray(32, 48);
  const decipher = createDecipheriv('aes-256-gcm', deriva(password, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buffer.subarray(48)), decipher.final()]);
  } catch {
    throw new Error('La password del backup non e\' quella giusta.');
  }
}

/**
 * Confronto a tempo costante di due segreti gia' derivati. Serve dove si
 * confrontano hash e non si passa da GCM.
 */
export function confronta(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
