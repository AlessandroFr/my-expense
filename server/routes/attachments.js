// Allegati delle spese — contratto identico a AttachmentController +
// App\Attachment.
//
// I file stanno in uploads/expenses/{user_id}/, fuori da public/: l'unico modo
// di leggerli e' questo endpoint, che verifica sempre a chi appartengono.

import { createReadStream, existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { uploadsDir } from '../paths.js';

import { all, one, run, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseMultipart, sniffMimeType } from '../multipart.js';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const findForUser = (id, userId) => one(
  `SELECT id, expense_id, user_id, original_name, stored_name, mime_type, size_bytes
   FROM expense_attachments WHERE id = ? AND user_id = ? LIMIT 1`,
  id, userId,
);

const filePath = (userId, storedName) => join(uploadsDir(userId), storedName);

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const expenseId = int(searchParams.get('expense_id'));
  if (expenseId <= 0) throw HttpError.badRequest('ID spesa mancante.');

  ok(res, {
    attachments: all(
      `SELECT id, expense_id, original_name, mime_type, size_bytes, created_at
       FROM expense_attachments WHERE expense_id = ? AND user_id = ?
       ORDER BY created_at DESC, id DESC`,
      expenseId, currentUserId(),
    ),
  });
}

async function upload(req, res) {
  const { fields, files } = await parseMultipart(req);
  assertCsrf(req, fields);
  const userId = currentUserId();

  const expenseId = int(fields.expense_id);
  if (expenseId <= 0) throw HttpError.badRequest('ID spesa mancante.');
  if (!one('SELECT 1 AS x FROM expenses WHERE id = ? AND user_id = ?', expenseId, userId)) {
    throw HttpError.badRequest('Spesa non trovata.');
  }

  const file = files.file;
  if (!file) throw HttpError.badRequest('Nessun file caricato.');

  const size = file.data.length;
  if (size <= 0 || size > MAX_BYTES) {
    throw HttpError.badRequest(`Dimensione file non valida (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
  }

  // Il tipo si decide dai byte, non da quello che dichiara il browser.
  const mime = sniffMimeType(file.data);
  const ext = ALLOWED_MIME[mime];
  if (!ext) throw HttpError.badRequest('Tipo file non ammesso (jpg/png/gif/webp/pdf).');

  // Il nome originale serve solo come etichetta: il file su disco prende un
  // nome casuale, cosi' non puo' contenere percorsi o caratteri ostili.
  let original = str(file.filename).split(/[\\/]/).pop() || 'file';
  if ([...original].length > 255) original = [...original].slice(0, 255).join('');

  const userDir = uploadsDir(userId, true);

  const stored = `${randomBytes(16).toString('hex')}.${ext}`;
  writeFileSync(join(userDir, stored), file.data);

  const result = run(
    `INSERT INTO expense_attachments
       (expense_id, user_id, original_name, stored_name, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    expenseId, userId, original, stored, mime, size,
  );

  ok(res, {
    attachment: {
      id: Number(result.lastInsertRowid),
      expense_id: expenseId,
      original_name: original,
      mime_type: mime,
      size_bytes: size,
    },
  });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID allegato mancante.');

  const row = findForUser(id, userId);
  if (!row) throw HttpError.badRequest('Allegato non trovato.');

  const path = filePath(userId, row.stored_name);
  // Se il file non c'e' piu' si prosegue lo stesso: il record va comunque via.
  try { if (existsSync(path)) unlinkSync(path); } catch { /* best-effort */ }

  run('DELETE FROM expense_attachments WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { deleted: true });
}

async function download(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const id = int(searchParams.get('id'));
  if (id <= 0) throw HttpError.badRequest('ID mancante.');

  const row = findForUser(id, userId);
  if (!row) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const path = filePath(userId, row.stored_name);
  if (!existsSync(path)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('File missing');
    return;
  }

  const disposition = int(searchParams.get('download')) === 1 ? 'attachment' : 'inline';
  res.writeHead(200, {
    'Content-Type': row.mime_type,
    'Content-Length': statSync(path).size,
    // Il nome puo' contenere virgolette o accenti: va codificato.
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
    'Cache-Control': 'private, max-age=3600',
  });
  createReadStream(path).pipe(res);
}

export const attachmentRoutes = {
  'GET /attachments/list': list,
  'POST /attachments/upload': upload,
  'POST /attachments/delete': remove,
  'GET /attachments/download': download,
};
