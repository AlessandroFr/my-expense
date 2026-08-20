// Import ed export CSV delle spese — contratto identico a
// ExpenseController::export/import + App\CsvService.
//
// Il formato e' quello che Excel italiano apre senza chiedere nulla: BOM
// UTF-8, separatore ';', importi con la virgola decimale.

import { all, one, run, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, str } from '../http.js';
import { parseMultipart } from '../multipart.js';

const HEADERS = ['Data', 'Categoria', 'Descrizione', 'Importo', 'Pagamento'];
const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];
const PAY_LABELS_IT = { contanti: 'cash', carta: 'card', bonifico: 'transfer', altro: 'other' };

/**
 * Quota un campo come fputcsv di PHP, che e' piu' generoso di quanto ci si
 * aspetti: mette le virgolette anche quando il campo contiene un semplice
 * spazio o una tabulazione, non solo separatore, virgolette o a capo.
 * Serve per produrre file identici a quelli esportati finora.
 */
function quote(value) {
  const s = String(value ?? '');
  return /[";\\\r\n\t ]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Divide una riga CSV tenendo conto delle virgolette. */
export function splitCsvLine(line, delimiter) {
  const out = [];
  let campo = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { campo += '"'; i++; } else inQuotes = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delimiter) { out.push(campo); campo = ''; continue; }
    campo += c;
  }
  out.push(campo);
  return out;
}

/** Il separatore si deduce dalla prima riga: chi esporta da Excel usa ';'. */
export function detectDelimiter(sample) {
  const testa = sample.replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
  const candidati = [';', ',', '\t', '|'];
  let migliore = ';';
  let massimo = 0;
  for (const c of candidati) {
    const n = testa.split(c).length - 1;
    if (n > massimo) { massimo = n; migliore = c; }
  }
  return massimo > 0 ? migliore : ';';
}

export function parseDate(raw) {
  const s = str(raw);
  if (s === '') throw HttpError.badRequest('Data mancante.');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    return `${m[3].padStart(4, '0')}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  }
  throw HttpError.badRequest(`Data non valida: '${s}'.`);
}

/**
 * Importi nei formati che capitano davvero: "1.234,56" all'italiana,
 * "1234.56" all'inglese, con o senza simbolo di valuta.
 */
export function parseAmount(raw) {
  let s = str(raw).replace(/EUR|€|\s/g, '');
  if (s === '') throw HttpError.badRequest('Importo mancante.');

  if (s.includes(',') && s.includes('.')) {
    // Entrambi presenti: il punto e' il separatore delle migliaia.
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) throw HttpError.badRequest(`Importo non valido: '${s}'.`);
  return s;
}

export function parsePayment(raw) {
  const s = str(raw).toLowerCase();
  if (s === '') return 'card';
  if (PAYMENT_METHODS.includes(s)) return s;
  if (PAY_LABELS_IT[s]) return PAY_LABELS_IT[s];
  throw HttpError.badRequest(`Metodo di pagamento non riconosciuto: '${s}'.`);
}

const columnIndex = (header, names) => header.findIndex((h) => names.includes(h));

async function exportCsv(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const clauses = ['e.user_id = ?', 'e.is_transfer = 0'];
  const params = [userId];
  const add = (clause, value) => { clauses.push(clause); params.push(value); };

  const dateFrom = str(searchParams.get('date_from'));
  const dateTo = str(searchParams.get('date_to'));
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) add('e.expense_date >= ?', dateFrom);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) add('e.expense_date <= ?', dateTo);
  if (int(searchParams.get('category_id'))) add('e.category_id = ?', int(searchParams.get('category_id')));
  if (str(searchParams.get('amount_min'))) add('e.amount >= ?', Number(searchParams.get('amount_min')) || 0);
  if (str(searchParams.get('amount_max'))) add('e.amount <= ?', Number(searchParams.get('amount_max')) || 0);
  if (str(searchParams.get('search'))) add('e.description LIKE ?', `%${str(searchParams.get('search'))}%`);

  const rows = all(
    `SELECT e.expense_date, e.description, e.amount, e.payment_method, c.name AS category_name
     FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY e.expense_date DESC, e.id DESC LIMIT 5000`,
    ...params,
  );

  const righe = [HEADERS.map(quote).join(';')];
  for (const r of rows) {
    righe.push([
      r.expense_date ?? '',
      r.category_name ?? '',
      r.description ?? '',
      // La virgola decimale: e' cosi' che Excel italiano legge il numero.
      Number(r.amount).toFixed(2).replace('.', ','),
      r.payment_method ?? '',
    ].map(quote).join(';'));
  }

  // Il BOM dice a Excel che il file e' UTF-8, altrimenti storpia gli accenti.
  const body = Buffer.from(`﻿${righe.join('\n')}\n`, 'utf8');
  const filename = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Length': body.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function importCsv(req, res) {
  const { fields, files } = await parseMultipart(req);
  assertCsrf(req, fields);
  const userId = currentUserId();

  const file = files.file;
  if (!file) throw HttpError.badRequest('Nessun file caricato.');
  if (!/\.csv$/i.test(file.filename)) throw HttpError.badRequest('Sono accettati solo file .csv.');

  const testo = file.data.toString('utf8').replace(/^﻿/, '');
  const righe = testo.split(/\r?\n/);
  if (righe.length === 0 || righe[0].trim() === '') throw HttpError.badRequest('CSV vuoto o illeggibile.');

  const delimiter = detectDelimiter(testo);
  const header = splitCsvLine(righe[0], delimiter).map((c) => str(c).toLowerCase());

  const idx = {
    date: columnIndex(header, ['data', 'date']),
    category: columnIndex(header, ['categoria', 'category']),
    description: columnIndex(header, ['descrizione', 'description', 'note']),
    amount: columnIndex(header, ['importo', 'amount', 'totale']),
    payment: columnIndex(header, ['pagamento', 'payment', 'metodo']),
  };
  if (idx.date === -1 || idx.amount === -1) {
    throw HttpError.badRequest('Colonne richieste mancanti: serve almeno Data e Importo.');
  }

  const createMissing = fields.create_missing_categories === undefined
    ? true
    : int(fields.create_missing_categories) === 1;

  // Le categorie esistenti si caricano una volta sola.
  const catCache = new Map(
    all('SELECT id, name FROM categories WHERE user_id = ?', userId).map((c) => [c.name.toLowerCase(), c.id]),
  );

  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (let n = 1; n < righe.length; n++) {
    const linea = righe[n];
    if (linea.trim() === '') continue;

    try {
      const row = splitCsvLine(linea, delimiter);
      const date = parseDate(row[idx.date] ?? '');
      const amount = parseAmount(row[idx.amount] ?? '');
      const payment = parsePayment(idx.payment !== -1 ? row[idx.payment] ?? '' : '');

      let categoryId = null;
      const catName = idx.category !== -1 ? str(row[idx.category]) : '';
      if (catName !== '') {
        const key = catName.toLowerCase();
        if (catCache.has(key)) {
          categoryId = catCache.get(key);
        } else if (createMissing) {
          const r = run(
            'INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, NULL, 0)',
            userId, catName, '#6c757d',
          );
          categoryId = Number(r.lastInsertRowid);
          catCache.set(key, categoryId);
        } else {
          throw HttpError.badRequest(`Categoria '${catName}' non esistente.`);
        }
      }

      const description = idx.description !== -1 ? str(row[idx.description]) || null : null;
      if (Number(amount) < 0.01) throw HttpError.badRequest('Importo non valido (minimo 0.01).');

      run(
        `INSERT INTO expenses (user_id, category_id, amount, description, payment_method, expense_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userId, categoryId, Number(amount).toFixed(2), description, payment, date,
      );
      imported++;
    } catch (err) {
      // Una riga sbagliata non ferma l'importazione: si segnala e si prosegue.
      skipped++;
      errors.push({ line: n + 1, message: err.message });
    }
  }

  ok(res, { imported, skipped, errors });
}

export const csvRoutes = {
  'GET /expenses/export': exportCsv,
  'POST /expenses/import': importCsv,
};
