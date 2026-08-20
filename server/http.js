// Envelope JSON e controlli di richiesta, identici a quelli che il frontend
// gia' si aspetta da PHP (App\Json + CsrfMiddleware). Vedi
// public/js/componentBase.js::normalizeApiResponse.

/** Codici errore: stessi valori stringa di App\Http\Response. */
export const ERR = {
  validation: 'validation_error',
  unauthenticated: 'unauthenticated',
  csrf: 'csrf',
  forbidden: 'forbidden',
  notFound: 'not_found',
  conflict: 'conflict',
  server: 'server_error',
};

export class HttpError extends Error {
  constructor(message, code = ERR.server, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
  static badRequest(m) { return new HttpError(m, ERR.validation, 400); }
  static notFound(m)   { return new HttpError(m, ERR.notFound, 404); }
  static conflict(m)   { return new HttpError(m, ERR.conflict, 409); }
}

export function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export const ok = (res, data) => sendJson(res, { ok: true, data });

export const fail = (res, err) => sendJson(res, {
  ok: false,
  error: {
    code: err instanceof HttpError ? err.code : ERR.server,
    message: err?.message ?? 'Errore interno.',
  },
}, err instanceof HttpError ? err.status : 500);

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Corpo della richiesta: form-urlencoded (come manda FetchRequest.js) o JSON. */
export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw HttpError.badRequest('Richiesta troppo grande.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); }
    catch { throw HttpError.badRequest('JSON non valido.'); }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/**
 * CSRF con double submit: il cookie csrf_token e' leggibile da JS
 * (FetchRequest.js lo rimanda come header X-CSRF-Token), quindi la
 * corrispondenza prova che la richiesta viene da una pagina di questa origine.
 *
 * Non serve la sessione PHP, quindi funziona anche per gli endpoint gia'
 * passati a Node mentre il login e' ancora servito da PHP.
 */
export function assertCsrf(req, body) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;

  const cookie = parseCookies(req).csrf_token;
  const sent = req.headers['x-csrf-token'] ?? body?._csrf;
  if (!cookie || !sent || cookie !== sent) {
    throw new HttpError('CSRF token non valido.', ERR.csrf, 403);
  }
}

/**
 * L'app ascolta solo su loopback, ma un sito aperto nel browser puo' comunque
 * provare a chiamarla: si accettano solo richieste che dichiarano il nostro
 * stesso host (difesa contro DNS rebinding).
 */
export function assertLocalOrigin(req) {
  const host = req.headers.host ?? '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) {
    throw new HttpError('Host non ammesso.', ERR.forbidden, 403);
  }
  const origin = req.headers.origin;
  if (origin) {
    let originHost;
    try { originHost = new URL(origin).host; } catch { originHost = null; }
    if (originHost !== host) throw new HttpError('Origine non ammessa.', ERR.forbidden, 403);
  }
}

export const int = (v, fallback = 0) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

export const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
