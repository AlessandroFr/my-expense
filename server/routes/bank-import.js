// Import da estratto conto — contratto identico a BankImportController +
// App\BankStatementImporter.
//
// Due passaggi: l'anteprima legge il file e propone tipo, categoria e
// controparte riga per riga senza scrivere nulla; la conferma riceve le righe
// come le ha lasciate l'utente e le scrive.
//
// Un movimento gia' importato non entra due volte: ogni riga ha un'impronta
// (conto + data + importo con segno + descrizione) con un vincolo UNIQUE.

import { createHash } from 'node:crypto';

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, str } from '../http.js';
import { parseMultipart } from '../multipart.js';
import { explodeInstallments, validateSpec } from '../installments.js';
import { splitCsvLine } from './csv.js';
import { findOrCreate as findOrCreateContact } from './contacts.js';
import {
  KIND_ATM_PAIR, KIND_EXPENSE, KIND_INCOME, KIND_TRANSFER_PAIR,
  classifyExpense, classifyIncomeSource, extractCounterparty, extractIban,
  findHeaderRow, guessIncomePaymentMethod, guessPaymentMethod,
  isAtmWithdrawalDescription, loadAndDecode, normalizeName, parseBankAmount, parseItDate,
} from '../bank-statement.js';

const KINDS = [KIND_EXPENSE, KIND_INCOME, KIND_TRANSFER_PAIR, KIND_ATM_PAIR];

/**
 * Impronta della riga. La descrizione viene normalizzata e troncata: le banche
 * cambiano spaziatura fra un export e l'altro, e senza normalizzare lo stesso
 * movimento entrerebbe due volte.
 */
function computeImportHash(accountId, opDate, signedAmount, desc) {
  const norm = String(desc ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const key = `${accountId}|${opDate}|${signedAmount.toFixed(2)}|${[...norm].slice(0, 120).join('')}`;
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

const loadExistingHashes = (userId) => {
  const set = new Set();
  for (const t of ['expenses', 'incomes']) {
    for (const r of all(`SELECT import_hash FROM ${t} WHERE user_id = ? AND import_hash IS NOT NULL`, userId)) {
      set.add(r.import_hash);
    }
  }
  return set;
};

const ensureIsoDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw HttpError.badRequest(`Data non valida: '${s}' (atteso YYYY-MM-DD).`);
  return s;
};

const ensurePositiveAmount = (v) => {
  const f = Number.parseFloat(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(f) || f <= 0) throw HttpError.badRequest('Importo non valido.');
  return Math.round(f * 100) / 100;
};

const findAccount = (id, userId) =>
  one('SELECT id, name, type FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', id, userId);

/** Conta i movimenti orfani che un nome collegherebbe, per mostrarlo in anteprima. */
function previewBackfillCount(userId, name) {
  const nome = str(name);
  if ([...nome].length < 4) return 0;
  const like = `%${nome.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
  const conta = (sql, ...params) => one(sql, ...params).n;
  return conta('SELECT COUNT(*) AS n FROM expenses WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?', userId, like)
    + conta('SELECT COUNT(*) AS n FROM incomes WHERE user_id = ? AND contact_id IS NULL AND (description LIKE ? OR source LIKE ?)', userId, like, like)
    + conta('SELECT COUNT(*) AS n FROM recurring_expenses WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?', userId, like);
}

// ─── Anteprima ──────────────────────────────────────────────────────────────

async function preview(req, res) {
  const { fields, files } = await parseMultipart(req);
  assertCsrf(req, fields);
  const userId = currentUserId();

  const accountId = int(fields.account_id);
  if (accountId <= 0) throw HttpError.badRequest('Seleziona il conto su cui importare i movimenti.');
  const sourceAccount = findAccount(accountId, userId);
  if (!sourceAccount) throw HttpError.badRequest('Conto sorgente non trovato.');

  const file = files.file;
  if (!file) throw HttpError.badRequest('Nessun file caricato.');
  if (!/\.csv$/i.test(file.filename)) throw HttpError.badRequest('Sono accettati solo file .csv.');

  const autoPairRicariche = fields.auto_pair_ricariche === undefined || int(fields.auto_pair_ricariche) === 1;
  const autoPairPrelievi = fields.auto_pair_prelievi === undefined || int(fields.auto_pair_prelievi) === 1;

  const lines = loadAndDecode(file.data).split(/\r\n|\n|\r/);
  const headerIdx = findHeaderRow(lines);
  if (headerIdx === null) {
    throw HttpError.badRequest(
      "Header non trovato. Atteso: 'Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate'.",
    );
  }

  const iban = extractIban(lines.slice(0, headerIdx));

  const categories = all('SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY sort_order ASC, name ASC', userId)
    .map((c) => ({ id: c.id, name: c.name, color: c.color }));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  // Le categorie proposte si creano subito, cosi' nell'anteprima l'utente le
  // vede gia' selezionate invece di un "nessuna categoria".
  const ensureCategory = (name) => {
    const key = name.toLowerCase();
    if (catByName.has(key)) return catByName.get(key);
    const r = run(
      'INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, NULL, 0)',
      userId, name, '#6c757d',
    );
    const id = Number(r.lastInsertRowid);
    categories.push({ id, name, color: '#6c757d' });
    catByName.set(key, id);
    return id;
  };

  const existingHashes = loadExistingHashes(userId);

  const accountsOut = all(
    'SELECT id, name, type FROM accounts WHERE user_id = ? AND archived = 0 ORDER BY sort_order ASC, name ASC',
    userId,
  ).map((a) => ({ id: a.id, name: a.name, type: a.type }));

  let suggestPrepaidId = accountsOut.find((a) => a.name.toLowerCase() === 'carta prepagata')?.id ?? null;
  const cash = one(
    `SELECT id FROM accounts WHERE user_id = ? AND type = 'cash'
     ORDER BY is_default_cash DESC, sort_order ASC, id ASC LIMIT 1`, userId,
  );
  let suggestCashId = cash?.id ?? null;
  // Un conto non puo' trasferire a se stesso: meglio nessun suggerimento.
  if (suggestPrepaidId === accountId) suggestPrepaidId = null;
  if (suggestCashId === accountId) suggestCashId = null;

  const rows = [];
  const parseErrors = [];
  let emptyCnt = 0;
  let idx = 0;
  let lineNum = headerIdx + 1;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    lineNum++;
    const raw = lines[i] ?? '';
    if (raw.trim() === '') { emptyCnt++; continue; }

    const cols = splitCsvLine(raw, ';');
    if (cols.length < 6) { emptyCnt++; continue; }

    try {
      const tipologia = str(cols[2]);
      const descrizione = str(cols[3]);
      const uscita = str(cols[4]);
      const entrata = str(cols[5]);

      const opDate = parseItDate(cols[0]);
      const valDate = str(cols[1]) === '' ? null : parseItDate(cols[1]);

      const isExpense = uscita !== '';
      const isIncome = entrata !== '';
      if (!isExpense && !isIncome) { emptyCnt++; continue; }
      if (isExpense && isIncome) throw HttpError.badRequest('Riga con sia Uscita che Entrata: non supportato.');

      const amount = parseBankAmount(isExpense ? uscita : entrata);
      if (amount <= 0) throw HttpError.badRequest('Importo non valido (zero o negativo dopo parsing).');

      // Ricarica di una prepagata e prelievo bancomat non sono spese: sono
      // soldi che si spostano fra due conti dell'utente.
      const isPrepaidRecharge = isExpense
        && /Ricariche/i.test(tipologia) && /RICARICA\/RIMBORSO/i.test(descrizione);
      const isAtm = isExpense && isAtmWithdrawalDescription(descrizione);

      let kind;
      if (isPrepaidRecharge && autoPairRicariche) kind = KIND_TRANSFER_PAIR;
      else if (isAtm && autoPairPrelievi) kind = KIND_ATM_PAIR;
      else kind = isExpense ? KIND_EXPENSE : KIND_INCOME;

      const hash = computeImportHash(accountId, opDate, isExpense ? -amount : amount, descrizione);
      const duplicato = existingHashes.has(hash);

      const row = {
        idx: idx++,
        csv_row: lineNum,
        kind,
        op_date: opDate,
        value_date: valDate,
        tipologia,
        description: descrizione,
        amount: Math.round(amount * 100) / 100,
        is_duplicate: duplicato,
        skip: duplicato,
        category_id: null,
        category_suggested: null,
        source: null,
        payment_method: null,
        dest_account_id: null,
      };

      if (kind === KIND_TRANSFER_PAIR) row.dest_account_id = suggestPrepaidId;
      else if (kind === KIND_ATM_PAIR) row.dest_account_id = suggestCashId;

      if (kind !== KIND_INCOME) {
        const catName = kind === KIND_TRANSFER_PAIR ? 'Trasferimenti interni'
          : kind === KIND_ATM_PAIR ? 'Prelievo contante'
            : classifyExpense(tipologia, descrizione);
        row.category_suggested = catName;
        row.category_id = ensureCategory(catName);
        row.payment_method = kind === KIND_ATM_PAIR ? 'cash' : guessPaymentMethod(tipologia, descrizione);
      } else {
        row.source = classifyIncomeSource(tipologia, descrizione);
        row.payment_method = guessIncomePaymentMethod(tipologia);
      }

      row.contact_suggested_name = null;
      row.contact_id_matched = null;
      row.contact_propagated = false;
      if (kind === KIND_EXPENSE || kind === KIND_INCOME) {
        const suggerito = extractCounterparty(tipologia, descrizione, kind === KIND_EXPENSE ? 'expense' : 'income');
        if (suggerito !== null) {
          row.contact_suggested_name = suggerito;
          const match = one('SELECT id FROM contacts WHERE user_id = ? AND name_norm = ? LIMIT 1',
            userId, normalizeName(suggerito));
          if (match) row.contact_id_matched = match.id;
        }
      }

      rows.push(row);
    } catch (err) {
      parseErrors.push({ row: lineNum, message: err.message });
    }
  }

  // Se un nome e' stato riconosciuto in una riga, si applica anche alle altre
  // che lo contengono nella descrizione: cinque scontrini dello stesso negozio
  // vengono attribuiti tutti, non solo quello che il riconoscimento ha colto.
  const resolvedNames = new Map();
  for (const r of rows) {
    if (r.kind !== KIND_EXPENSE && r.kind !== KIND_INCOME) continue;
    const sn = r.contact_suggested_name;
    if (sn === null) continue;
    const norm = normalizeName(sn);
    if ([...norm].length < 4) continue;
    if (!resolvedNames.has(norm)) resolvedNames.set(norm, { name: sn, idMatched: r.contact_id_matched });
  }
  if (resolvedNames.size > 0) {
    for (const r of rows) {
      if (r.kind !== KIND_EXPENSE && r.kind !== KIND_INCOME) continue;
      if (r.contact_suggested_name !== null) continue;
      const descLow = String(r.description ?? '').toLowerCase();
      if (descLow === '') continue;
      for (const [norm, info] of resolvedNames) {
        if (descLow.includes(norm)) {
          r.contact_suggested_name = info.name;
          r.contact_id_matched = info.idMatched;
          r.contact_propagated = true;
          break;
        }
      }
    }
  }

  // Quanti movimenti gia' registrati verrebbero collegati dai nomi nuovi.
  const countsByName = new Map();
  for (const r of rows) {
    const sn = r.contact_suggested_name;
    if (sn === null || r.contact_id_matched !== null) { r.contact_backfill_count = 0; continue; }
    if (!countsByName.has(sn)) countsByName.set(sn, previewBackfillCount(userId, sn));
    r.contact_backfill_count = countsByName.get(sn);
  }
  for (const r of rows) if (r.contact_backfill_count === undefined) r.contact_backfill_count = 0;

  ok(res, {
    account: { id: sourceAccount.id, name: sourceAccount.name },
    account_iban_detected: iban,
    categories,
    accounts: accountsOut,
    dest_suggestions: { transfer_pair: suggestPrepaidId, atm_pair: suggestCashId },
    skipped_empty: emptyCnt,
    parse_errors: parseErrors,
    rows,
  });
}

// ─── Conferma ───────────────────────────────────────────────────────────────

const categoriaTrasferimenti = (userId) => {
  const existing = one('SELECT id FROM categories WHERE user_id = ? AND name = ? LIMIT 1', userId, 'Trasferimento');
  if (existing) return existing.id;
  const r = run('INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
    userId, 'Trasferimento', '#6c757d', 'arrow-left-right', 100);
  return Number(r.lastInsertRowid);
};

/** Conto prepagata di destinazione: se non esiste lo crea. */
function resolvePrepaidAccount(userId, name) {
  const existing = one('SELECT id FROM accounts WHERE user_id = ? AND name = ? LIMIT 1', userId, name);
  if (existing) return existing.id;
  const r = run(
    `INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, sort_order)
     VALUES (?, ?, 'card', '#9c27b0', 'credit-card', '0.00', 100)`,
    userId, name,
  );
  return Number(r.lastInsertRowid);
}

/** Conto cassa predefinito: se non esiste lo crea ("In tasca"). */
function ensureDefaultCash(userId) {
  const existing = one(
    `SELECT id FROM accounts WHERE user_id = ? AND type = 'cash'
     ORDER BY is_default_cash DESC, sort_order ASC, id ASC LIMIT 1`, userId,
  );
  if (existing) return existing.id;
  const r = run(
    `INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, sort_order, is_default_cash)
     VALUES (?, 'In tasca', 'cash', '#20c997', 'wallet2', '0.00', 50, 1)`,
    userId,
  );
  return Number(r.lastInsertRowid);
}

const resolveContactFromRow = (userId, rowIn) => {
  const cid = int(rowIn.contact_id);
  if (cid > 0) return cid;
  const nome = str(rowIn.contact_name);
  return nome !== '' ? findOrCreateContact(userId, nome) : null;
};

/** INSERT che tollera il duplicato: ritorna null se l'impronta esiste gia'. */
function insertIgnoringDuplicate(sql, ...params) {
  try {
    return Number(run(sql, ...params).lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return null;
    throw err;
  }
}

const insertImportedExpense = (d) => insertIgnoringDuplicate(
  `INSERT INTO expenses
     (user_id, category_id, contact_id, account_id, amount, description, payment_method,
      expense_date, value_date, import_hash, is_transfer, transfer_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  d.userId, d.categoryId, d.contactId, d.accountId, d.amount, d.description,
  d.payment, d.opDate, d.valueDate, d.hash, d.transferId !== null ? 1 : 0, d.transferId,
);

const insertImportedIncome = (d) => insertIgnoringDuplicate(
  `INSERT INTO incomes
     (user_id, account_id, contact_id, source, description, amount, payment_method,
      income_date, value_date, import_hash, is_transfer, transfer_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  d.userId, d.accountId, d.contactId, d.source, d.description, d.amount,
  d.payment, d.opDate, d.valueDate, d.hash, d.transferId !== null ? 1 : 0, d.transferId,
);

async function commit(req, res) {
  const body = await (async () => {
    // Le righe arrivano come JSON in un campo di form.
    const tipo = req.headers['content-type'] ?? '';
    if (tipo.includes('multipart/form-data')) return (await parseMultipart(req)).fields;
    const { readBody } = await import('../http.js');
    return readBody(req);
  })();
  assertCsrf(req, body);
  const userId = currentUserId();

  const accountId = int(body.account_id);
  if (accountId <= 0) throw HttpError.badRequest('Conto sorgente mancante.');
  const sourceAccount = findAccount(accountId, userId);
  if (!sourceAccount) throw HttpError.badRequest('Conto sorgente non trovato.');

  const prepaidName = str(body.prepaid_account_name) || 'Carta Prepagata';

  const rowsRaw = str(body.rows);
  if (rowsRaw === '') throw HttpError.badRequest('Nessuna riga da importare.');
  let rows;
  try { rows = JSON.parse(rowsRaw); } catch { rows = null; }
  if (!Array.isArray(rows)) throw HttpError.badRequest('Formato righe non valido (JSON atteso).');

  const installmentsMap = new Map();
  const instRaw = str(body.installments);
  if (instRaw !== '') {
    let decoded;
    try { decoded = JSON.parse(instRaw); } catch { decoded = null; }
    if (!Array.isArray(decoded)) throw HttpError.badRequest('Formato installments non valido (JSON atteso).');
    for (const entry of decoded) {
      if (!entry || entry.row_idx === undefined) continue;
      installmentsMap.set(int(entry.row_idx), {
        count: int(entry.count),
        frequency: str(entry.frequency) || 'monthly',
        custom_days: entry.custom_days === undefined || entry.custom_days === null ? null : int(entry.custom_days),
      });
    }
  }

  const existingHashes = loadExistingHashes(userId);
  let importedExp = 0;
  let importedInc = 0;
  let pairedCnt = 0;
  let dupCnt = 0;
  let skipUser = 0;
  let installmentsExp = 0;
  const errors = [];

  let prepaidAccountId = null;
  let cashAccountId = null;

  for (const rowIn of rows) {
    const idx = int(rowIn?.idx, -1);
    try {
      if (rowIn?.skip) { skipUser++; continue; }

      const kind = str(rowIn.kind);
      if (!KINDS.includes(kind)) throw HttpError.badRequest('Tipo riga non valido.');

      const opDate = ensureIsoDate(str(rowIn.op_date));
      const valueDate = str(rowIn.value_date) !== '' ? ensureIsoDate(str(rowIn.value_date)) : null;
      const description = str(rowIn.description);
      const amount = ensurePositiveAmount(rowIn.amount);
      const categoryId = int(rowIn.category_id) || null;

      // ── Le due partite doppie ────────────────────────────────────────────
      if (kind === KIND_TRANSFER_PAIR || kind === KIND_ATM_PAIR) {
        const atm = kind === KIND_ATM_PAIR;

        let destId = int(rowIn.dest_account_id) || null;
        let destName;
        if (destId !== null) {
          if (destId === accountId) throw HttpError.badRequest('Conto destinazione coincide con quello sorgente.');
          const dest = findAccount(destId, userId);
          if (!dest) throw HttpError.badRequest(`Conto destinazione id=${destId} non trovato.`);
          destName = dest.name;
        } else if (atm) {
          if (cashAccountId === null) cashAccountId = ensureDefaultCash(userId);
          if (cashAccountId === accountId) {
            throw HttpError.badRequest('Il conto sorgente coincide con la cassa contanti: impossibile fare partita doppia.');
          }
          destId = cashAccountId;
          destName = findAccount(destId, userId)?.name ?? 'In tasca';
        } else {
          if (prepaidAccountId === null) prepaidAccountId = resolvePrepaidAccount(userId, prepaidName);
          if (prepaidAccountId === accountId) {
            throw HttpError.badRequest(`Il conto sorgente coincide con '${prepaidName}': impossibile fare partita doppia.`);
          }
          destId = prepaidAccountId;
          destName = prepaidName;
        }

        const baseHash = computeImportHash(accountId, opDate, -amount, description);
        if (existingHashes.has(baseHash)) { dupCnt++; continue; }

        const esito = transaction(() => {
          const t = run(
            `INSERT INTO transfers
               (user_id, source_account_id, destination_account_id, amount, transfer_date, description, notes)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`,
            userId, accountId, destId, amount.toFixed(2), opDate,
            description !== '' ? description.slice(0, 255)
              : `${atm ? 'Prelievo ATM' : 'Ricarica'} → ${destName}`,
          );
          const transferId = Number(t.lastInsertRowid);

          const expId = insertImportedExpense({
            userId,
            categoryId: categoryId ?? categoriaTrasferimenti(userId),
            contactId: null,
            accountId,
            amount: amount.toFixed(2),
            description: `${atm ? 'Prelievo ATM' : 'Ricarica'} → ${destName}`,
            payment: 'transfer',
            opDate,
            valueDate,
            hash: `${baseHash}${atm ? ':exp-atm' : ':exp'}`,
            transferId,
          });
          const incId = insertImportedIncome({
            userId,
            accountId: destId,
            contactId: null,
            source: atm ? 'Prelievo ATM' : 'Trasferimento da conto',
            description: `${atm ? 'Prelievo da' : 'Ricarica da'} ${sourceAccount.name}`,
            amount: amount.toFixed(2),
            payment: atm ? 'cash' : 'transfer',
            opDate,
            valueDate,
            hash: `${baseHash}${atm ? ':inc-atm' : ':inc'}`,
            transferId,
          });

          // Se una delle due meta' e' un duplicato si annulla tutto: meglio
          // niente che un trasferimento senza la sua contropartita.
          if (expId === null || incId === null) throw new DuplicateHalf();
          return true;
        });

        if (esito === true) {
          existingHashes.add(baseHash);
          pairedCnt++;
          importedExp++;
          importedInc++;
        }
        continue;
      }

      // ── Spesa singola ────────────────────────────────────────────────────
      if (kind === KIND_EXPENSE) {
        const contactId = resolveContactFromRow(userId, rowIn);
        const payment = str(rowIn.payment_method) || 'card';
        const hash = computeImportHash(accountId, opDate, -amount, description);

        const spec = installmentsMap.get(idx);
        if (spec) {
          if (existingHashes.has(hash)) { dupCnt++; continue; }
          const clean = validateSpec(spec);
          const rate = explodeInstallments(amount.toFixed(2), clean.count, opDate, clean.frequency, clean.custom_days);

          const inserite = transaction(() => {
            const ids = [];
            for (const r of rate) {
              const primo = r.seq === 1;
              const id = insertIgnoringDuplicate(
                `INSERT INTO expenses
                   (user_id, category_id, contact_id, account_id, amount, description, payment_method,
                    expense_date, value_date, import_hash, is_transfer, installment_seq,
                    installment_total, parent_expense_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
                userId, categoryId, contactId, accountId, r.amount,
                description !== '' ? description : null, payment, r.date,
                // Solo la prima rata porta impronta e data valuta: e' quella
                // che corrisponde al movimento sull'estratto conto.
                primo ? valueDate : null, primo ? hash : null,
                r.seq, clean.count, primo ? null : ids[0],
              );
              if (primo && id === null) throw new DuplicateHalf();
              ids.push(id);
            }
            return ids.length;
          });

          if (inserite > 0) {
            existingHashes.add(hash);
            importedExp += inserite;
            installmentsExp += inserite;
          } else dupCnt++;
          continue;
        }

        const id = insertImportedExpense({
          userId, categoryId, contactId, accountId,
          amount: amount.toFixed(2),
          description: description !== '' ? description : null,
          payment, opDate, valueDate, hash, transferId: null,
        });
        if (id === null) dupCnt++; else importedExp++;
        continue;
      }

      // ── Entrata singola ──────────────────────────────────────────────────
      const source = str(rowIn.source) || 'Entrata';
      const contactId = resolveContactFromRow(userId, rowIn);
      const payment = str(rowIn.payment_method) || 'transfer';
      const hash = computeImportHash(accountId, opDate, amount, description);

      const id = insertImportedIncome({
        userId, accountId, contactId, source,
        description: description !== '' ? description : null,
        amount: amount.toFixed(2),
        payment, opDate, valueDate, hash, transferId: null,
      });
      if (id === null) dupCnt++; else importedInc++;
    } catch (err) {
      if (err instanceof DuplicateHalf) { dupCnt++; continue; }
      errors.push({ idx, message: err.message });
    }
  }

  ok(res, {
    imported_expenses: importedExp,
    imported_incomes: importedInc,
    transfers_paired: pairedCnt,
    skipped_duplicate: dupCnt,
    skipped_user: skipUser,
    installments_exploded: installmentsExp,
    errors,
  });
}

/** Segnala che una meta' della partita doppia era gia' presente: si annulla. */
class DuplicateHalf extends Error {}

export const bankImportRoutes = {
  'POST /import/bank-statement/preview': preview,
  'POST /import/bank-statement/commit': commit,
};
