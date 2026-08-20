// Riconoscimento dei trasferimenti dentro i movimenti gia' importati —
// traduce TransferService::backfillImportedPairs.
//
// Serve per gli import fatti prima che l'importer creasse la riga `transfers`:
// spesa e entrata sono in archivio ma non risultano collegate, quindi
// compaiono come movimenti veri e gonfiano i totali.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, ok, readBody } from '../http.js';

async function backfillImported(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  // Due formati da riconoscere: quello attuale, con l'impronta che finisce in
  // ':exp' o ':exp-atm', e quello vecchio, dove la colonna troncava il
  // suffisso e le due meta' condividevano la stessa impronta — li' l'unico
  // indizio e' la descrizione generata dall'importer.
  const candidati = all(
    `SELECT id, account_id, amount, expense_date, value_date, description, import_hash
     FROM expenses
     WHERE user_id = ? AND transfer_id IS NULL AND import_hash IS NOT NULL
       AND (import_hash LIKE '%:exp'
            OR import_hash LIKE '%:exp-atm'
            OR description LIKE 'Ricarica → %'
            OR description LIKE 'Prelievo ATM → %')
     ORDER BY id ASC`,
    userId,
  );

  let migrated = 0;
  let skippedNoPair = 0;
  let skippedMismatch = 0;

  for (const exp of candidati) {
    const expHash = String(exp.import_hash);
    const incHash = expHash.endsWith(':exp-atm') ? `${expHash.slice(0, -':exp-atm'.length)}:inc-atm`
      : expHash.endsWith(':exp') ? `${expHash.slice(0, -':exp'.length)}:inc`
        : expHash;

    const inc = one(
      'SELECT id, account_id, amount, income_date, transfer_id FROM incomes WHERE user_id = ? AND import_hash = ? LIMIT 1',
      userId, incHash,
    );
    if (!inc) { skippedNoPair++; continue; }

    // Entrata gia' collegata ma spesa no: stato incoerente, meglio non toccare.
    if (inc.transfer_id !== null) { skippedMismatch++; continue; }

    if (String(exp.amount) !== String(inc.amount) || String(exp.expense_date) !== String(inc.income_date)) {
      skippedMismatch++;
      continue;
    }

    const sourceId = exp.account_id;
    const destId = inc.account_id;
    if (!sourceId || !destId || sourceId === destId) { skippedMismatch++; continue; }

    transaction(() => {
      const t = run(
        `INSERT INTO transfers
           (user_id, source_account_id, destination_account_id, amount, transfer_date, description, notes)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        userId, sourceId, destId, exp.amount, exp.expense_date,
        exp.description && String(exp.description).trim() !== '' ? String(exp.description).slice(0, 255) : null,
      );
      const transferId = Number(t.lastInsertRowid);
      run('UPDATE expenses SET transfer_id = ?, is_transfer = 1 WHERE id = ? AND user_id = ?',
        transferId, exp.id, userId);
      run('UPDATE incomes SET transfer_id = ?, is_transfer = 1 WHERE id = ? AND user_id = ?',
        transferId, inc.id, userId);
    });
    migrated++;
  }

  ok(res, { migrated, skipped_no_pair: skippedNoPair, skipped_mismatch: skippedMismatch });
}

export const transferBackfillRoutes = {
  'POST /transfers/backfill-imported': backfillImported,
};
