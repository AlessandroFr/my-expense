/**
 * Server dell'applicazione.
 *
 * Serve le pagine, gli endpoint JSON e i file statici. Ascolta solo su
 * 127.0.0.1: l'app è per chi sta davanti al computer, non per la rete.
 *
 * Il database è cifrato e si apre con una password: finché non è stata data,
 * il server sta in piedi ma sa servire solo la schermata di sblocco (o quella
 * di benvenuto, al primo avvio). Il cancello è qui sotto, in un punto solo:
 * una route dimenticata non deve poter scavalcare la password.
 *
 * Resta il token CSRF, che è un'altra cosa e serve anche a chi è già dentro:
 * impedisce a una pagina qualunque aperta nel browser di chiamare 127.0.0.1 a
 * nostra insaputa.
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { assertLocalOrigin, fail, HttpError, parseCookies, sendJson } from './http.js';
import { routes } from './routes/index.js';
import { serveStatic } from './static.js';
import { stato } from './lock.js';

/**
 * Token CSRF del processo. Vale finché l'app resta aperta: non c'è una sessione
 * da cui derivarlo, e per il doppio invio (cookie + header) questo basta.
 */
const csrfToken = randomBytes(32).toString('hex');

/** Le uniche strade percorribili a database chiuso. */
const APERTE = new Set([
  '/sblocca', '/benvenuto',
  '/sicurezza/sblocca', '/sicurezza/proteggi', '/sicurezza/completa',
]);

/** Dove mandare chi bussa nello stato in cui siamo. */
function dirottamento(pathname) {
  const dove = stato();
  if (dove === 'aperto') {
    // Sbloccati, quelle due pagine non hanno piu' niente da dire.
    return ['/sblocca', '/benvenuto'].includes(pathname) ? '/dashboard' : null;
  }
  if (APERTE.has(pathname)) return null;
  return dove === 'chiuso' ? '/sblocca' : '/benvenuto';
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  try {
    assertLocalOrigin(req);
  } catch (err) {
    fail(res, err);
    return;
  }

  if (serveStatic(req, res, pathname)) return;

  const verso = dirottamento(pathname);
  if (verso) {
    // Una pagina si rimanda; una chiamata del frontend riceve un codice che
    // dice «sei fuori»: 423 Locked, che componentBase.js mostra com'e'.
    if (req.headers.accept?.includes('text/html')) {
      res.writeHead(302, { Location: verso });
      res.end();
    } else {
      sendJson(res, {
        ok: false,
        error: { code: 'locked', message: 'Il database e\' chiuso: serve la password.', redirect: verso },
      }, 423);
    }
    return;
  }

  const handler = routes.get(`${req.method} ${pathname}`);
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>Pagina non trovata</title>'
      + '<p style="font:16px system-ui;padding:2rem">Pagina non trovata. '
      + '<a href="/dashboard">Torna alla dashboard</a>.</p>');
    return;
  }

  // Il cookie viene creato alla prima pagina; se manca (per esempio dopo un
  // riavvio) lo si rimanda insieme alla risposta.
  req.csrfToken = csrfToken;
  const cookie = parseCookies(req).csrf_token;
  if (cookie !== csrfToken && !res.headersSent) {
    res.setHeader('Set-Cookie', `csrf_token=${csrfToken}; Path=/; SameSite=Lax`);
  }

  try {
    await handler(req, res);
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(`[${req.method} ${pathname}]`, err);
    if (!res.headersSent) fail(res, err);
  }
});

/**
 * Mette il server in ascolto.
 *
 * Il database **non** si apre qui: e' cifrato, e la chiave arriva dalla
 * password che l'utente scrive nella schermata di sblocco, che e' servita da
 * questo stesso server. Quindi prima si ascolta, poi si apre.
 *
 * La porta 0 significa «scegline una libera tu»: e' quello che usa Electron,
 * e toglie di mezzo sia i conflitti sia la ricerca di una porta libera.
 *
 * @param {number} requestedPort 0 per una porta qualunque
 * @returns {Promise<{port: number, url: string, close: () => void}>}
 */
export function start(requestedPort = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        url: `http://127.0.0.1:${port}/`,
        close: () => server.close(),
      });
    });
  });
}

// Avviato a mano (`npm start`): porta fissa, cosi' l'indirizzo non cambia a
// ogni riavvio e il browser tiene i preferiti. Importato da Electron: niente,
// e' il main process a decidere quando partire.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await start(Number(process.env.PORT ?? 8080));
  console.log(`My Expense in ascolto su ${url}`);
}
