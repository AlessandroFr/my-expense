/**
 * Server dell'applicazione.
 *
 * Serve le pagine, gli endpoint JSON e i file statici. Ascolta solo su
 * 127.0.0.1: l'app è per chi sta davanti al computer, non per la rete.
 *
 * Non c'è login: è un'applicazione per una persona sola sulla sua macchina, e
 * chi ha accesso al computer ha già accesso al file del database. Resta invece
 * il token CSRF, che serve a impedire a una pagina qualunque aperta nel browser
 * di chiamare 127.0.0.1 a nostra insaputa.
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

import { assertLocalOrigin, fail, HttpError, parseCookies } from './http.js';
import { routes } from './routes/index.js';
import { serveStatic } from './static.js';
import { ensureUser } from './db.js';

const PORT = Number(process.env.PORT ?? 8080);

/**
 * Token CSRF del processo. Vale finché l'app resta aperta: non c'è una sessione
 * da cui derivarlo, e per il doppio invio (cookie + header) questo basta.
 */
const csrfToken = randomBytes(32).toString('hex');

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  try {
    assertLocalOrigin(req);
  } catch (err) {
    fail(res, err);
    return;
  }

  if (serveStatic(req, res, pathname)) return;

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

ensureUser();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`My Expense in ascolto su http://127.0.0.1:${PORT}/`);
});
