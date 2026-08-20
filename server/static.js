/**
 * File statici sotto public/: CSS, JavaScript, manifest, service worker.
 *
 * Prende il posto di `php -S`, che finora li serviva insieme al resto. Fuori da
 * public/ non c'e' niente di raggiungibile: uploads/, config/ e data/ restano
 * fuori portata anche se qualcuno indovina il percorso.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Serve il file se esiste dentro public/.
 * @returns {boolean} true se la richiesta e' stata servita
 */
export function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel === '/' || rel === '') return false;

  // normalize risolve i ".." prima del controllo: senza, un percorso costruito
  // ad arte uscirebbe da public/.
  const full = normalize(join(publicDir, rel));
  if (full !== publicDir && !full.startsWith(publicDir + sep)) return false;
  if (!existsSync(full)) return false;

  const info = statSync(full);
  if (!info.isFile()) return false;

  const tipo = TIPI[extname(full).toLowerCase()] ?? 'application/octet-stream';
  // Gli asset arrivano con ?v=<data>, quindi il browser richiede da solo la
  // versione nuova quando il file cambia; il service worker no, non va messo in
  // cache o resterebbe quello vecchio.
  const cache = full.endsWith(`${sep}sw.js`) ? 'no-cache' : 'public, max-age=3600';

  res.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': info.size,
    'Cache-Control': cache,
    'Last-Modified': info.mtime.toUTCString(),
  });

  if (req.method === 'HEAD') { res.end(); return true; }
  createReadStream(full).pipe(res);
  return true;
}
