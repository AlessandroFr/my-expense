// Budget mensili — contratto identico a BudgetController + BudgetService.

import { all, one, run, currentUserId } from '../db.js';
import { assertCsrf, HttpError, int, ok, readBody, str } from '../http.js';
import { parseAmountLikePhp, roundLikePhp } from '../amount.js';
import { listForUser as listCategories } from './categories.js';

const isYearMonth = (ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);

function assertYearMonth(ym) {
  if (!isYearMonth(ym)) throw HttpError.badRequest('Mese non valido (formato YYYY-MM).');
}

/** Primo giorno del mese successivo, per il confronto con '<'. */
function nextMonthStart(ym) {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(Date.UTC(y, m, 1)); // m (1-based) = mese successivo 0-based
  return date.toISOString().slice(0, 10);
}

/**
 * Le percentuali e le soglie vivono nell'Entity Budget lato PHP: qui vanno
 * riprodotte, comprese quelle che il frontend legge per decidere se mostrare
 * l'avviso (public/js/pages/expenses.js::showBudgetWarning).
 */
export function toPublic(row) {
  const amount = Number(row.amount);
  const spent = Number(row.spent);
  const round2 = (n) => roundLikePhp(n, 2);
  // La soglia si confronta sulla percentuale grezza: progress_pct e' arrotondato
  // a un decimale e farebbe scattare l'avviso gia' a 79,95%.
  const rawPct = amount > 0 ? (spent / amount) * 100 : 0;

  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name ?? '',
    color: row.color ?? '#6c757d',
    icon: row.icon ?? null,
    year_month: row.year_month ?? '',
    amount: round2(amount),
    spent: round2(spent),
    remaining: round2(amount - spent),
    progress_pct: amount > 0 ? roundLikePhp(rawPct, 1) : 0,
    exceeded: spent > amount,
    near_limit: amount > 0 && rawPct >= 80 && spent <= amount,
  };
}

export function progressForMonth(userId, ym) {
  return all(
    `SELECT b.id, b.category_id, b.year_month, b.amount,
            c.name, c.color, c.icon,
            COALESCE(SUM(e.amount), 0) AS spent
     FROM budgets b
     INNER JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
     LEFT JOIN expenses e
       ON e.user_id = b.user_id
      AND e.category_id = b.category_id
      AND e.expense_date >= ?
      AND e.expense_date <  ?
      AND e.is_transfer = 0
     WHERE b.user_id = ? AND b.year_month = ?
     GROUP BY b.id, b.category_id, b.year_month, b.amount, c.name, c.color, c.icon
     ORDER BY c.sort_order ASC, c.name ASC`,
    `${ym}-01`, nextMonthStart(ym), userId, ym,
  ).map(toPublic);
}

/** Stato del budget di una categoria, o null se non ne ha uno per quel mese. */
export function checkForCategory(userId, categoryId, ym) {
  if (!categoryId || !isYearMonth(ym)) return null;
  const row = one(
    `SELECT b.id, b.category_id, b.year_month, b.amount,
            c.name, c.color, c.icon,
            COALESCE(SUM(e.amount), 0) AS spent
     FROM budgets b
     INNER JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
     LEFT JOIN expenses e
       ON e.user_id = b.user_id
      AND e.category_id = b.category_id
      AND e.expense_date >= ?
      AND e.expense_date <  ?
      AND e.is_transfer = 0
     WHERE b.user_id = ? AND b.category_id = ? AND b.year_month = ?
     GROUP BY b.id, b.category_id, b.year_month, b.amount, c.name, c.color, c.icon
     LIMIT 1`,
    `${ym}-01`, nextMonthStart(ym), userId, categoryId, ym,
  );
  return row ? toPublic(row) : null;
}

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const ym = str(searchParams.get('month')) || new Date().toISOString().slice(0, 7);
  assertYearMonth(ym);
  const userId = currentUserId();

  ok(res, {
    month: ym,
    budgets: progressForMonth(userId, ym),
    categories: listCategories(userId),
  });
}

async function set(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const categoryId = int(body.category_id);
  if (categoryId <= 0) throw HttpError.badRequest('Categoria mancante.');

  const ym = str(body.month);
  assertYearMonth(ym);

  const amount = parseAmountLikePhp(body.amount);
  if (amount < 0.01) throw HttpError.badRequest('Importo non valido (minimo 0.01).');
  if (amount > 99999999.99) throw HttpError.badRequest('Importo troppo grande.');

  if (!one('SELECT 1 AS x FROM categories WHERE id = ? AND user_id = ?', categoryId, userId)) {
    throw HttpError.badRequest('Categoria non trovata.');
  }

  run(
    `INSERT INTO budgets (user_id, category_id, year_month, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, category_id, year_month) DO UPDATE SET amount = excluded.amount`,
    userId, categoryId, ym, amount.toFixed(2),
  );
  ok(res, { saved: true });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);

  const categoryId = int(body.category_id);
  if (categoryId <= 0) throw HttpError.badRequest('Categoria mancante.');
  const ym = str(body.month);
  assertYearMonth(ym);

  run(
    'DELETE FROM budgets WHERE user_id = ? AND category_id = ? AND year_month = ?',
    currentUserId(), categoryId, ym,
  );
  ok(res, { deleted: true });
}

export const budgetRoutes = {
  'GET /budgets/list': list,
  'POST /budgets/set': set,
  'POST /budgets/delete': remove,
};
