/**
 * Sblocco, primo avvio e gestione della password.
 *
 * Sono le uniche route che rispondono a database chiuso: l'elenco sta in
 * `server/index.js`, e aggiungerne una qui non basta a renderla raggiungibile.
 */

import { setTimeout as attendi } from 'node:timers/promises';

import { assertCsrf, HttpError, ok, readBody, str } from '../http.js';
import { currentUserId, run, transaction } from '../db.js';
import { pageNuda } from '../view.js';
import * as lock from '../lock.js';
import * as vault from '../vault.js';
import { parseAmountItaliano, roundLikePhp } from '../amount.js';

import * as sbloccaPage from '../pages/sblocca.js';
import * as benvenutoPage from '../pages/benvenuto.js';

/** Le categorie con cui si parte: poche e ovvie, il resto lo aggiunge l'uso. */
const CATEGORIE_INIZIALI = [
  ['Spesa e casa', '#0d6efd', 'bi-cart'],
  ['Bollette', '#6f42c1', 'bi-lightning-charge'],
  ['Trasporti', '#20c997', 'bi-car-front'],
  ['Salute', '#d63384', 'bi-heart-pulse'],
  ['Ristoranti e bar', '#fd7e14', 'bi-cup-hot'],
  ['Svago', '#0dcaf0', 'bi-controller'],
  ['Stipendio', '#198754', 'bi-wallet2'],
  ['Altro', '#6c757d', null],
];

const html = (res, body) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};

/** Una sigla di valuta, o niente. */
function valuta(raw, campo = 'La valuta') {
  const v = str(raw).toUpperCase();
  if (!/^[A-Z]{3}$/.test(v)) throw HttpError.badRequest(`${campo} è una sigla di tre lettere, per esempio EUR.`);
  return v;
}

function passwordValida(raw) {
  const pw = String(raw ?? '');
  if (pw.length < 8) throw HttpError.badRequest('La password deve avere almeno 8 caratteri.');
  return pw;
}

export const sicurezzaRoutes = {
  'GET /sblocca': (req, res) => html(res, pageNuda({
    title: 'Sblocca',
    content: sbloccaPage.render({ csrfToken: req.csrfToken }),
    scripts: '<script type="module" src="/js/pages/sblocca.js"></script>',
  })),

  'GET /benvenuto': (req, res) => html(res, pageNuda({
    title: 'Benvenuto',
    content: benvenutoPage.render({ csrfToken: req.csrfToken, modo: lock.stato() }),
    scripts: '<script type="module" src="/js/pages/benvenuto.js"></script>',
  })),

  /** Apre il database con la password o con la chiave di recupero. */
  'POST /sicurezza/sblocca': async (req, res) => {
    const body = await readBody(req);
    assertCsrf(req, body);

    const segreto = String(body.segreto ?? '');
    if (!segreto) throw HttpError.badRequest('Scrivi la password.');

    const con = lock.sblocca(segreto);
    if (!con) {
      // Mezzo secondo a ogni tentativo sbagliato. Non ferma chi si porta via il
      // file — quello deve comunque passare da scrypt — ma toglie di mezzo
      // l'idea di provarle tutte da qui dentro.
      await attendi(500);
      throw new HttpError('Password o chiave di recupero non riconosciuta.', 'unauthenticated', 401);
    }

    // Entrato con la chiave di recupero: la password che aveva non la sa più
    // nessuno, quindi gliene va chiesta una nuova subito.
    return ok(res, { con, deveCambiarePassword: con === 'recupero' });
  },

  /**
   * Crea la protezione: database nuovo, oppure database in chiaro da cifrare.
   * Risponde con la chiave di recupero, che è l'unica volta in cui è leggibile.
   */
  'POST /sicurezza/proteggi': async (req, res) => {
    const body = await readBody(req);
    assertCsrf(req, body);
    const password = passwordValida(body.password);

    const dove = lock.stato();
    if (dove === 'da-proteggere') {
      return ok(res, { chiaveRecupero: lock.cifraEsistente(password), cifrato: true });
    }
    if (dove !== 'nuovo') throw HttpError.conflict('La protezione è già stata creata.');
    return ok(res, { chiaveRecupero: lock.proteggiNuovo(password), cifrato: false });
  },

  /** Chiude la procedura di benvenuto: utente, valuta principale, primo conto. */
  'POST /sicurezza/completa': async (req, res) => {
    const body = await readBody(req);
    assertCsrf(req, body);
    if (lock.stato() !== 'da-configurare') throw HttpError.conflict('L\'app è già configurata.');

    const username = str(body.username) || 'io';
    const base = valuta(body.base_currency, 'La valuta principale');
    const contoNome = str(body.conto_nome) || 'Conto corrente';
    const contoValuta = valuta(body.conto_valuta, 'La valuta del conto');
    const contoTipo = str(body.conto_tipo) || 'checking';
    const saldo = roundLikePhp(parseAmountItaliano(body.conto_saldo ?? 0));

    transaction(() => {
      run('INSERT INTO users (username, password_hash, base_currency) VALUES (?, \'\', ?)',
        username, base);
      const userId = currentUserId();

      run(`INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, currency, sort_order)
           VALUES (?, ?, ?, '#6c757d', NULL, ?, ?, 0)`,
        userId, contoNome, contoTipo, saldo.toFixed(2), contoValuta);

      CATEGORIE_INIZIALI.forEach(([name, color, icon], i) => {
        run('INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
          userId, name, color, icon, i);
      });
    });

    return ok(res, { fatto: true });
  },

  /** Cambio password dalle impostazioni. La chiave di recupero non cambia. */
  'POST /sicurezza/password': async (req, res) => {
    const body = await readBody(req);
    assertCsrf(req, body);
    const nuova = passwordValida(body.nuova);

    // Chi è entrato con la chiave di recupero deve poter mettere una password
    // nuova senza conoscere quella vecchia: è tutto il senso della chiave.
    if (str(body.vecchia)) {
      if (!vault.cambiaPassword(String(body.vecchia), nuova)) {
        await attendi(500);
        throw HttpError.badRequest('La password attuale non è quella giusta.');
      }
    } else {
      vault.impostaPassword(lock.chiaveCorrente(), nuova);
    }
    return ok(res, { fatto: true });
  },

  /** Rigenera la chiave di recupero: la vecchia smette di funzionare. */
  'POST /sicurezza/chiave-recupero': async (req, res) => {
    const body = await readBody(req);
    assertCsrf(req, body);
    return ok(res, { chiaveRecupero: vault.rigeneraChiaveRecupero(lock.chiaveCorrente()) });
  },

  /** Lo stato della protezione, per la pagina delle impostazioni. */
  'GET /sicurezza/stato': (req, res) => ok(res, {
    stato: lock.stato(),
    copiaInChiaro: lock.copiaInChiaro(),
  }),
};
