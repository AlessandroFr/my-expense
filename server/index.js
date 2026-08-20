/**
 * Server dell'applicazione.
 *
 * Durante la migrazione da PHP a Node questo processo sta DAVANTI: serve gli
 * endpoint gia' riscritti e inoltra tutto il resto a `php -S` su una porta
 * interna. Il frontend non se ne accorge — stessi URL, stesso envelope JSON.
 *
 * Quando l'ultimo dominio sara' passato a Node, il proxy sparisce e con lui PHP.
 */

import { createServer, request as httpRequest } from 'node:http';
import { assertLocalOrigin, fail, HttpError } from './http.js';
import { routes } from './routes/index.js';

const PORT = Number(process.env.PORT ?? 8080);
const PHP_PORT = Number(process.env.PHP_PORT ?? 8081);

/** Inoltra la richiesta a php -S mantenendo header, cookie e corpo. */
function proxyToPhp(req, res) {
  const upstream = httpRequest(
    {
      host: '127.0.0.1',
      port: PHP_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${PHP_PORT}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'Il processo PHP non risponde sulla porta ' + PHP_PORT + '.\n' +
      'Avvia l\'app con avvia.cmd, che lancia entrambi i processi.\n\n' +
      err.message,
    );
  });

  req.pipe(upstream);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const handler = routes.get(`${req.method} ${pathname}`);

  if (!handler) {
    proxyToPhp(req, res);
    return;
  }

  try {
    assertLocalOrigin(req);
    await handler(req, res);
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(`[${req.method} ${pathname}]`, err);
    if (!res.headersSent) fail(res, err);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const migrati = routes.size;
  console.log(`My Expense in ascolto su http://127.0.0.1:${PORT}/`);
  console.log(`  ${migrati} endpoint serviti da Node, il resto inoltrato a PHP:${PHP_PORT}`);
});
