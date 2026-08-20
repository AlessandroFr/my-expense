/**
 * Lettura di un form multipart/form-data.
 *
 * Node non ha un parser multipart nella libreria standard e il progetto non ha
 * dipendenze: qui ce n'e' uno essenziale, sufficiente per il caricamento di un
 * allegato per volta. Il corpo resta in memoria, il che va bene perche' il
 * limite e' 8 MB (Attachment::MAX_BYTES) e a caricare e' una persona sola.
 *
 * ponytail: se un giorno servissero caricamenti grandi o multipli, la strada e'
 * scrivere su file mentre si legge, non ingrandire questo parser.
 */

import { HttpError } from './http.js';

const MAX_BODY = 12 * 1024 * 1024;

/** Legge tutto il corpo in un Buffer, fermandosi se supera il limite. */
async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw HttpError.badRequest('File troppo grande.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Estrae il valore di un parametro dell'header, es. name="file". */
function param(header, key) {
  const match = header.match(new RegExp(`${key}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

/**
 * @returns {{fields: Record<string,string>, files: Record<string,{filename:string,contentType:string,data:Buffer}>}}
 */
export async function parseMultipart(req) {
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw HttpError.badRequest('Richiesta multipart senza delimitatore.');

  const boundary = `--${(boundaryMatch[1] ?? boundaryMatch[2]).trim()}`;
  const body = await readRaw(req);

  const fields = {};
  const files = {};

  // Le parti sono separate dal boundary; l'ultima e' seguita da "--".
  let start = body.indexOf(boundary);
  if (start === -1) throw HttpError.badRequest('Corpo multipart malformato.');
  start += boundary.length;

  while (start < body.length) {
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break; // "--": fine
    // Salta il CRLF dopo il boundary.
    if (body[start] === 0x0d) start += 2;

    const headerEnd = body.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;

    const headers = body.subarray(start, headerEnd).toString('utf8');
    const next = body.indexOf(boundary, headerEnd);
    if (next === -1) break;

    // Il contenuto termina con il CRLF che precede il boundary successivo.
    const data = body.subarray(headerEnd + 4, next - 2);

    const disposition = headers.split('\r\n').find((h) => /^content-disposition:/i.test(h)) ?? '';
    const name = param(disposition, 'name');
    const filename = param(disposition, 'filename');

    if (name !== null) {
      if (filename !== null) {
        const typeLine = headers.split('\r\n').find((h) => /^content-type:/i.test(h)) ?? '';
        files[name] = {
          filename,
          contentType: typeLine.split(':')[1]?.trim() ?? 'application/octet-stream',
          data,
        };
      } else {
        fields[name] = data.toString('utf8');
      }
    }

    start = next + boundary.length;
  }

  return { fields, files };
}

/**
 * Riconosce il tipo dai primi byte del file, non da quello che dichiara il
 * browser: e' quello che fa finfo lato PHP, ed e' l'unico controllo che un
 * client non puo' aggirare rinominando il file.
 */
export function sniffMimeType(buffer) {
  const b = buffer;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (b.length >= 6) {
    const head = b.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (b.length >= 12
      && b.subarray(0, 4).toString('latin1') === 'RIFF'
      && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return 'application/octet-stream';
}
