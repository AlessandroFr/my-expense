// Backup — contratto identico a BackupController + App\BackupService.
//
// Restano a PHP /backup/restore e /db/reset: entrambi chiedono la password
// come freno prima di un'operazione distruttiva, e verificarla significa
// confrontare un hash bcrypt, che Node non sa fare senza dipendenze. Togliere
// quel controllo per poterli migrare sarebbe indebolire due operazioni che
// cancellano dati, quindi restano dove sono finche' non si decide cosa fare
// dell'autenticazione (vedi Fase 6 del piano).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { uploadsDir } from '../paths.js';

import { all, db, currentUserId } from '../db.js';
import { createZip } from '../zip.js';

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
  const rows = [
    `-- my-expense backup user_id=${userId} generated ${now.toISOString()}`,
    'PRAGMA foreign_keys = OFF;',
    '',
  ];

  for (const [table, userColumn] of TABLES) {
    rows.push(`-- Table: ${table}`);
    const rows = VIA_PARENT[table]
      ? all(VIA_PARENT[table], userId)
      : all(`SELECT * FROM ${table} WHERE ${userColumn} = ?`, userId);

    if (rows.length === 0) {
      rows.push('-- (no rows)', '');
      continue;
    }
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `\`${c}\``).join(', ');
    for (const r of rows) {
      rows.push(`INSERT INTO \`${table}\` (${colList}) VALUES (${cols.map((c) => sqlValue(r[c])).join(', ')});`);
    }
    rows.push('');
  }

  rows.push('PRAGMA foreign_keys = ON;');
  return rows.join('\n');
}

const readme = (userId, now) =>
  'Backup my-expense\n'
  + '===================\n'
  + `Generato il: ${now.toISOString().slice(0, 19).replace('T', ' ')}\n`
  + `User ID: ${userId}\n\n`
  + 'Contenuto:\n'
  + ' - dump.sql        INSERT statements scoped sul tuo user.\n'
  + ' - uploads/        Tutti gli allegati delle tue spese.\n\n'
  + 'Per ripristinare:\n'
  + " 1. Usa «Ripristina backup» dalle Impostazioni dell'app.\n"
  + '    In alternativa, da riga di comando:\n'
  + '    sqlite3 data/my-expense.sqlite < dump.sql\n'
  + ' 2. Copia la cartella uploads/ in {project_root}/uploads/expenses/{user_id}/\n';

async function download(req, res) {
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

  const zip = createZip(entries, now);
  const filename = `my-expense-backup-${now.toISOString().slice(0, 10)}.zip`;

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': zip.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(zip);
}

export const backupRoutes = {
  'GET /backup/download': download,
};
