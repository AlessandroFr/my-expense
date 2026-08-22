// Riconciliazione dei conti — contratto identico a AccountController +
// App\AccountReconciliation.
//
// L'utente dichiara il saldo reale del conto a una certa data; se non coincide
// con quello calcolato, la differenza diventa un movimento di rettifica.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { roundLikePhp } from '../amount.js';
import { withBalances } from './accounts.js';

const ADJUSTMENT_LABEL = 'Rettifica';
const today = () => new Date().toISOString().slice(0, 10);

/** Come isValidDate di PHP: rifiuta anche le date impossibili tipo 2026-02-31. */
function isRealDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Accetta la virgola decimale, rifiuta tutto cio' che non e' un numero. */
function parseAmount(raw) {
  const s = str(raw);
  if (s === '') return null;
  const normalized = s.replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < -99999999.99 || value > 99999999.99) return null;
  return value;
}

const balanceFor = (userId, accountId) => {
  const account = withBalances(userId, true).find((a) => a.id === accountId);
  return account ? account.balance : 0;
};

const adjustmentCategoryId = (userId) => {
  const existing = one('SELECT id FROM categories WHERE user_id = ? AND name = ? LIMIT 1',
    userId, ADJUSTMENT_LABEL);
  if (existing) return existing.id;
  const res = run(
    'INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
    userId, ADJUSTMENT_LABEL, '#6c757d', 'arrow-repeat', 100,
  );
  return Number(res.lastInsertRowid);
};

async function reconcile(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const accountId = int(body.account_id);
  if (accountId <= 0) throw HttpError.badRequest('ID conto mancante.');
  if (!one('SELECT 1 AS x FROM accounts WHERE id = ? AND user_id = ?', accountId, userId)) {
    throw HttpError.badRequest('Conto non trovato.');
  }

  const declared = parseAmount(body.declared_balance);
  if (declared === null) throw HttpError.badRequest('Saldo dichiarato non valido.');

  const reconciledAt = str(body.reconciled_at);
  if (!isRealDate(reconciledAt)) {
    throw HttpError.badRequest('Data riconciliazione non valida (formato YYYY-MM-DD).');
  }
  if (reconciledAt > today()) {
    throw HttpError.badRequest("La data di riconciliazione non puo' essere futura.");
  }

  let notes = str(body.notes) || null;
  if (notes !== null && [...notes].length > 255) {
    throw HttpError.badRequest('Note troppo lunghe (max 255 caratteri).');
  }

  const calculated = balanceFor(userId, accountId);
  const difference = roundLikePhp(declared - calculated, 2);
  const description = notes ? `Rettifica da riconciliazione — ${notes}` : 'Rettifica da riconciliazione';

  const row = transaction(() => {
    let adjustmentType = 'none';
    let expenseId = null;
    let incomeId = null;

    if (difference > 0) {
      // Il conto ha piu' soldi del previsto: manca un'entrata.
      const r = run(
        `INSERT INTO incomes (user_id, account_id, source, description, amount, income_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userId, accountId, ADJUSTMENT_LABEL, description, Math.abs(difference).toFixed(2), reconciledAt,
      );
      incomeId = Number(r.lastInsertRowid);
      adjustmentType = 'income';
    } else if (difference < 0) {
      const r = run(
        `INSERT INTO expenses
           (user_id, category_id, account_id, amount, description, payment_method, expense_date)
         VALUES (?, ?, ?, ?, ?, 'other', ?)`,
        userId, adjustmentCategoryId(userId), accountId,
        Math.abs(difference).toFixed(2), description, reconciledAt,
      );
      expenseId = Number(r.lastInsertRowid);
      adjustmentType = 'expense';
    }
    // Differenza zero: si registra comunque la verifica, senza movimenti.

    const r = run(
      `INSERT INTO account_reconciliations
         (user_id, account_id, reconciled_at, declared_balance, calculated_balance,
          difference, adjustment_type, adjustment_expense_id, adjustment_income_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, accountId, reconciledAt, declared.toFixed(2), calculated.toFixed(2),
      difference.toFixed(2), adjustmentType, expenseId, incomeId, notes,
    );

    return {
      id: Number(r.lastInsertRowid),
      user_id: userId,
      account_id: accountId,
      reconciled_at: reconciledAt,
      declared_balance: roundLikePhp(declared, 2),
      calculated_balance: roundLikePhp(calculated, 2),
      difference,
      adjustment_type: adjustmentType,
      adjustment_expense_id: expenseId,
      adjustment_income_id: incomeId,
      notes,
    };
  });

  ok(res, { reconciliation: row, new_balance: roundLikePhp(balanceFor(userId, accountId), 2) });
}

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const accountId = int(searchParams.get('account_id'));
  if (accountId <= 0) throw HttpError.badRequest('ID conto mancante.');

  ok(res, {
    items: all(
      `SELECT r.id, r.account_id, r.reconciled_at,
              r.declared_balance, r.calculated_balance, r.difference,
              r.adjustment_type, r.adjustment_expense_id, r.adjustment_income_id,
              r.notes, r.created_at,
              e.description AS expense_description, i.description AS income_description,
              e.amount AS expense_amount, i.amount AS income_amount
       FROM account_reconciliations r
       LEFT JOIN expenses e ON e.id = r.adjustment_expense_id
       LEFT JOIN incomes  i ON i.id = r.adjustment_income_id
       WHERE r.user_id = ? AND r.account_id = ?
       ORDER BY r.reconciled_at DESC, r.id DESC
       LIMIT 50`,
      userId, accountId,
    ),
  });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID riconciliazione mancante.');
  if (!one('SELECT 1 AS x FROM account_reconciliations WHERE id = ? AND user_id = ?', id, userId)) {
    throw HttpError.notFound('Riconciliazione non trovata.');
  }

  // Il movimento di rettifica resta: e' un movimento vero, ed e' quello che ha
  // reso il saldo corretto. La FK e' ON DELETE SET NULL.
  run('DELETE FROM account_reconciliations WHERE id = ? AND user_id = ?', id, userId);
  ok(res, { deleted: true });
}

export const reconciliationRoutes = {
  'POST /accounts/reconcile': reconcile,
  'GET /accounts/reconciliations': list,
  'POST /accounts/reconciliation/delete': remove,
};
