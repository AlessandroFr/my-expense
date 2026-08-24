// Backup.
//
// Il database e' cifrato: un backup in chiaro accanto a un database cifrato non
// proteggerebbe niente, sarebbe solo il posto piu' comodo da cui leggere i dati
// di qualcun altro. Quindi l'archivio esce cifrato anche lui, con la password
// dell'app — la stessa che serve ad aprirla, non un'altra da ricordare.
//
// La password si scrive al momento dell'esportazione e la chiave del file
// deriva da quella, non dal vault: un backup dev'essere apribile anche su un
// altro computer, dopo una reinstallazione, quando di questa macchina non
// resta niente.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as attendi } from 'node:timers/promises';

import { uploadsDir } from '../paths.js';

import { all, db, currentUserId } from '../db.js';
import { createZip } from '../zip.js';
import { assertCsrf, HttpError, readBody } from '../http.js';
import * as vault from '../vault.js';

/**
 * Tabelle incluse nel backup, nell'ordine in cui vanno reinserite perche' le
 * foreign key siano soddisfatte. Alcune non hanno user_id proprio e si
 * raggiungono passando dalla tabella padre.
 */
const TABLES = [
  ['users', 'id'],
  ['categories', 'user_id'],
  ['accounts', 'user_id'],
  ['contacts', 'user_id'],
  ['tags', 'user_id'],
  ['budgets', 'user_id'],
  ['recurring_expenses', 'user_id'],
  ['incomes', 'user_id'],
  ['expenses', 'user_id'],
  ['expense_tags', null],
  ['expense_attachments', 'user_id'],
  ['saved_filters', 'user_id'],
  ['transfers', 'user_id'],
  ['asset_classes', 'user_id'],
  ['securities_instruments', 'user_id'],
  ['securities_prices', null],
  ['securities_transactions', 'user_id'],
  ['pac_funds', 'user_id'],
  ['pac_fund_navs', null],
  ['pac_plans', 'user_id'],
  ['pac_contributions', 'user_id'],
];

/** Le tre tabelle che si filtrano passando dal padre. */
const VIA_PARENT = {
  expense_tags:
    `SELECT et.* FROM expense_tags et
     INNER JOIN expenses e ON e.id = et.expense_id WHERE e.user_id = ?`,
  securities_prices:
    `SELECT p.* FROM securities_prices p
     INNER JOIN securities_instruments s ON s.id = p.instrument_id WHERE s.user_id = ?`,
  pac_fund_navs:
    `SELECT n.* FROM pac_fund_navs n
     INNER JOIN pac_funds f ON f.id = n.fund_id WHERE f.user_id = ?`,
};

/** Letterale SQL: gli apici singoli si raddoppiano, come fa PDO::quote. */
function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function generateSqlDump(userId, now = new Date()) {
  // `righe` e non `rows`: dentro il ciclo c'era un secondo `const rows` con le
  // righe lette dal database, che copriva questo. Le INSERT finivano in quello
  // sbagliato e il dump usciva vuoto — anzi, non usciva affatto, perche' la
  // prima riga del ciclo leggeva la variabile prima della sua dichiarazione.
  const righe = [
    `-- my-expense backup user_id=${userId} generated ${now.toISOString()}`,
    'PRAGMA foreign_keys = OFF;',
    '',
  ];

  for (const [table, userColumn] of TABLES) {
    righe.push(`-- Table: ${table}`);
    const rows = VIA_PARENT[table]
      ? all(VIA_PARENT[table], userId)
      : all(`SELECT * FROM ${table} WHERE ${userColumn} = ?`, userId);

    if (rows.length === 0) {
      righe.push('-- (no rows)', '');
      continue;
    }
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `\`${c}\``).join(', ');
    for (const r of rows) {
      righe.push(`INSERT INTO \`${table}\` (${colList}) VALUES (${cols.map((c) => sqlValue(r[c])).join(', ')});`);
    }
    righe.push('');
  }

  righe.push('PRAGMA foreign_keys = ON;');
  return righe.join('\n');
}

const readme = (userId, now) =>
  'Backup my-expense\n'
  + '===================\n'
  + `Generato il: ${now.toISOString().slice(0, 19).replace('T', ' ')}\n`
  + `User ID: ${userId}\n\n`
  + 'Contenuto:\n'
  + ' - dump.sql        Tutti i tuoi dati.\n'
  + ' - uploads/        Tutti gli allegati delle tue spese.\n\n'
  + 'Per ripristinare:\n'
  + " 1. Usa «Ripristina backup» dalle Impostazioni dell'app, e dai la\n"
  + '    password che avevi quando questo backup e\' stato fatto.\n'
  + ' 2. Gli allegati tornano al loro posto da soli.\n';

async function download(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);

  // La password si verifica aprendo il vault: e' la stessa che apre l'app, e
  // qui serve due volte — a dire che sei tu, e a cifrare il file che esce.
  const password = String(body.password ?? '');
  if (!vault.apri(password)) {
    await attendi(500);
    throw new HttpError('La password non e\' quella giusta.', 'unauthenticated', 401);
  }

  const userId = currentUserId();
  const now = new Date();

  // WAL: senza questo, le scritture recenti potrebbero non essere ancora nel
  // file principale e finirebbero fuori dal backup.
  db().exec('PRAGMA wal_checkpoint(FULL)');

  const entries = [
    { name: 'dump.sql', data: Buffer.from(generateSqlDump(userId, now), 'utf8') },
    { name: 'README.txt', data: Buffer.from(readme(userId, now), 'utf8') },
  ];

  const dir = uploadsDir(userId);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (!statSync(path).isFile()) continue;
      entries.push({ name: `uploads/${name}`, data: readFileSync(path) });
    }
  }

  const archivio = vault.cifraConPassword(createZip(entries, now), password);
  const filename = `my-expense-backup-${now.toISOString().slice(0, 10)}.mxb`;

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': archivio.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(archivio);
}

export const backupRoutes = {
  // POST e non GET: un backup adesso chiede la password, e una password non
  // viaggia in un indirizzo che finisce nella cronologia.
  'POST /backup/download': download,
};
