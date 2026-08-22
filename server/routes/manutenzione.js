// Ripristino di un backup e azzeramento dei dati.
//
// Sono le due operazioni che cancellano dati, e prima erano protette anche
// dalla password. Senza login la password non esiste piu': restano il backup da
// scaricare prima (che l'interfaccia impone) e la frase da scrivere per esteso,
// che e' l'ultimo passo volontario prima di procedere.

import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { uploadsDir } from '../paths.js';

import { db, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, ok, readBody, str } from '../http.js';
import { parseMultipart } from '../multipart.js';
import { readZip } from '../zip.js';

const AMBITI = ['movements', 'movements_recurring', 'investments', 'all'];

/**
 * Tabelle accettate in un ripristino: tutte quelle che il backup salva, tranne
 * `users`, che non si sovrascrive.
 *
 * Prima l'elenco si fermava a saved_filters: trasferimenti, investimenti e piani
 * di accumulo finivano nel backup ma non tornavano indietro, e chi ripristinava
 * li perdeva senza che nulla lo segnalasse.
 */
const TABELLE_RIPRISTINO = [
  'categories', 'accounts', 'contacts', 'tags', 'budgets', 'recurring_expenses',
  'incomes', 'expenses', 'expense_tags', 'expense_attachments', 'saved_filters',
  'transfers', 'asset_classes', 'securities_instruments', 'securities_prices',
  'securities_transactions', 'pac_funds', 'pac_fund_navs', 'pac_plans', 'pac_contributions',
];

const attachmentsDir = (userId) => uploadsDir(userId);

/** Cancella i file degli allegati dell'utente, senza far fallire il resto. */
function clearAttachments(userId) {
  const dir = attachmentsDir(userId);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    try { rmSync(join(dir, f)); n++; } catch { /* best-effort */ }
  }
  return n;
}

async function dbReset(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const scope = str(body.scope);
  if (!AMBITI.includes(scope)) throw HttpError.badRequest('Ambito di reset non valido.');
  if (str(body.confirm_phrase) !== 'ELIMINA TUTTO') {
    throw HttpError.badRequest('Frase di conferma errata. Digita esattamente "ELIMINA TUTTO".');
  }

  const conta = {
    expense_attachments_deleted: 0, expense_tags_deleted: 0, expenses_deleted: 0,
    incomes_deleted: 0, recurring_reset: 0, recurring_deleted: 0, budgets_deleted: 0,
    saved_filters_deleted: 0, tags_deleted: 0, accounts_deleted: 0, contacts_deleted: 0,
    categories_deleted: 0, transfers_deleted: 0, securities_tx_deleted: 0,
    securities_instr_deleted: 0, asset_classes_deleted: 0, pac_contrib_deleted: 0,
    pac_plans_deleted: 0, pac_funds_deleted: 0, attachment_files_deleted: 0,
  };

  const perUtente = (tabella) => run(`DELETE FROM ${tabella} WHERE user_id = ?`, userId).changes;

  // Le foreign key si spengono per non dover cancellare nell'ordine giusto; il
  // pragma non ha effetto dentro una transazione, quindi va prima.
  db().exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      if (scope === 'investments') {
        conta.pac_contrib_deleted = perUtente('pac_contributions');
        conta.pac_plans_deleted = perUtente('pac_plans');
        conta.pac_funds_deleted = perUtente('pac_funds');
        conta.securities_tx_deleted = perUtente('securities_transactions');
        conta.securities_instr_deleted = perUtente('securities_instruments');
        conta.asset_classes_deleted = perUtente('asset_classes');
        conta.transfers_deleted = perUtente('transfers');
        return;
      }

      conta.expense_attachments_deleted = perUtente('expense_attachments');
      conta.expense_tags_deleted = run(
        'DELETE FROM expense_tags WHERE expense_id IN (SELECT id FROM expenses WHERE user_id = ?)',
        userId,
      ).changes;
      conta.expenses_deleted = perUtente('expenses');
      conta.incomes_deleted = perUtente('incomes');

      if (scope === 'movements_recurring') {
        conta.recurring_reset = run(
          'UPDATE recurring_expenses SET last_generated_date = NULL WHERE user_id = ?', userId,
        ).changes;
      }

      if (scope === 'all') {
        conta.pac_contrib_deleted = perUtente('pac_contributions');
        conta.pac_plans_deleted = perUtente('pac_plans');
        conta.pac_funds_deleted = perUtente('pac_funds');
        conta.securities_tx_deleted = perUtente('securities_transactions');
        conta.securities_instr_deleted = perUtente('securities_instruments');
        conta.asset_classes_deleted = perUtente('asset_classes');
        conta.transfers_deleted = perUtente('transfers');
        conta.saved_filters_deleted = perUtente('saved_filters');
        conta.budgets_deleted = perUtente('budgets');
        conta.recurring_deleted = perUtente('recurring_expenses');
        conta.tags_deleted = perUtente('tags');
        conta.accounts_deleted = perUtente('accounts');
        conta.contacts_deleted = perUtente('contacts');
        conta.categories_deleted = perUtente('categories');
      }
      // L'utente non viene mai cancellato: e' l'aggancio di tutti i dati.
    });
  } finally {
    db().exec('PRAGMA foreign_keys = ON');
  }

  // I file su disco dopo il commit: se qualcosa va storto restano solo file
  // orfani, non un database incoerente.
  conta.attachment_files_deleted = clearAttachments(userId);

  ok(res, { scope, counters: conta });
}

/** Divide i valori di una INSERT tenendo conto delle stringhe quotate. */
function tokenizza(s) {
  const out = [];
  let buf = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      buf += c;
      if (c === "'") {
        if (s[i + 1] === "'") { buf += "'"; i++; } else inString = false;
      }
      continue;
    }
    if (c === "'") { inString = true; buf += c; continue; }
    if (c === ',') { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim() !== '') out.push(buf.trim());
  return out;
}

async function backupRestore(req, res) {
  const { fields, files } = await parseMultipart(req);
  assertCsrf(req, fields);
  const userId = currentUserId();

  if (str(fields.confirm_phrase) !== 'RIPRISTINA BACKUP') {
    throw HttpError.badRequest('Frase di conferma errata. Digita esattamente "RIPRISTINA BACKUP".');
  }

  const file = files.file;
  if (!file) throw HttpError.badRequest('Nessun file caricato.');
  if (!/\.(zip|sql)$/i.test(file.filename)) throw HttpError.badRequest('Sono accettati solo file .zip o .sql.');
  if (file.data.length === 0) throw HttpError.badRequest('File caricato vuoto.');
  if (file.data.length > 64 * 1024 * 1024) throw HttpError.badRequest('File troppo grande (max 64 MB).');

  let dump = '';
  const allegati = [];

  if (/\.zip$/i.test(file.filename)) {
    let voci;
    try { voci = readZip(file.data); } catch { throw HttpError.badRequest('Archivio ZIP non valido o corrotto.'); }
    for (const v of voci) {
      if (v.name === 'dump.sql') { dump = v.data.toString('utf8'); continue; }
      if (v.name === 'README.txt') continue;
      if (v.name.startsWith('uploads/')) {
        const nome = v.name.slice('uploads/'.length);
        // Un nome con percorso dentro scriverebbe fuori dalla cartella.
        if (nome === '' || nome.includes('/') || nome.includes('\\')) continue;
        allegati.push({ nome, dati: v.data });
      }
    }
    if (dump === '') throw HttpError.badRequest('Lo ZIP non contiene dump.sql.');
  } else {
    dump = file.data.toString('utf8');
  }

  if (!/INSERT INTO/i.test(dump)) throw HttpError.badRequest('Il dump non contiene INSERT statements.');

  // Prima si azzera, poi si reinserisce: un ripristino sovrappone, non fonde.
  await dbResetInterno(userId);

  const righePerTabella = Object.fromEntries(TABELLE_RIPRISTINO.map((t) => [t, 0]));
  let scartate = 0;

  db().exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      for (const riga of dump.split(/\r?\n/)) {
        const l = riga.trim();
        if (l === '' || l.startsWith('--') || /^PRAGMA/i.test(l)) continue;
        if (!/^INSERT INTO/i.test(l)) continue;

        const m = l.match(/^INSERT INTO `([^`]+)` \(([^)]+)\) VALUES \((.*)\);\s*$/s);
        if (!m) { scartate++; continue; }

        const [, tabella, colonneRaw, valoriRaw] = m;
        if (!TABELLE_RIPRISTINO.includes(tabella)) { scartate++; continue; }

        const colonne = colonneRaw.split(',').map((c) => c.trim().replace(/^`|`$/g, ''));
        const valori = tokenizza(valoriRaw);
        if (colonne.length !== valori.length) {
          throw new Error(`Colonne e valori non combaciano su ${tabella} (${colonne.length} contro ${valori.length}).`);
        }

        // L'utente del backup può avere un id diverso da quello locale.
        const idx = colonne.indexOf('user_id');
        if (idx !== -1) valori[idx] = String(userId);

        db().exec(`INSERT INTO \`${tabella}\` (\`${colonne.join('`,`')}\`) VALUES (${valori.join(',')})`);
        righePerTabella[tabella]++;
      }
    });
  } finally {
    db().exec('PRAGMA foreign_keys = ON');
  }

  let fileEstratti = 0;
  if (allegati.length > 0) {
    const dir = uploadsDir(userId, true);
    for (const a of allegati) {
      try { writeFileSync(join(dir, a.nome), a.dati); fileEstratti++; } catch { /* best-effort */ }
    }
  }

  ok(res, { rows_per_table: righePerTabella, files_extracted: fileEstratti, skipped: scartate });
}

/** Azzeramento completo usato prima di un ripristino. */
async function dbResetInterno(userId) {
  const perUtente = (t) => run(`DELETE FROM ${t} WHERE user_id = ?`, userId);
  db().exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      run('DELETE FROM expense_tags WHERE expense_id IN (SELECT id FROM expenses WHERE user_id = ?)', userId);
      for (const t of [
        'expense_attachments', 'expenses', 'incomes', 'pac_contributions', 'pac_plans',
        'pac_funds', 'securities_transactions', 'securities_instruments', 'asset_classes',
        'transfers', 'saved_filters', 'budgets', 'recurring_expenses', 'tags',
        'accounts', 'contacts', 'categories',
      ]) perUtente(t);
    });
  } finally {
    db().exec('PRAGMA foreign_keys = ON');
  }
  clearAttachments(userId);
}

export const manutenzioneRoutes = {
  'POST /db/reset': dbReset,
  'POST /backup/restore': backupRestore,
};
