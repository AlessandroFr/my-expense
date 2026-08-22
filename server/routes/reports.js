// Dashboard e report annuale — contratto identico a DashboardController e
// ReportController.
//
// Sono i due endpoint di sola lettura che mettono insieme tutto il resto:
// movimenti, budget, titoli e piani di accumulo.

import { all, one, currentUserId } from '../db.js';
import { HttpError, int, ok, str } from '../http.js';
import { roundLikePhp, roundLikePhp as round2 } from '../amount.js';
import { progressForMonth } from './budgets.js';
import { holdingsForUser, holdingsByAssetClass } from './securities.js';
import { generatePending } from './recurring.js';

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Somma dei movimenti in un intervallo, trasferimenti esclusi. */
const totalForRange = (table, dateCol, userId, from, to) => Number(one(
  `SELECT COALESCE(SUM(amount), 0) AS t FROM ${table}
   WHERE user_id = ? AND ${dateCol} >= ? AND ${dateCol} <= ? AND is_transfer = 0`,
  userId, from, to,
).t);

const totalsByMonth = (table, dateCol, userId, monthsBack) => {
  const inizioMese = new Date();
  inizioMese.setUTCDate(1);
  inizioMese.setUTCMonth(inizioMese.getUTCMonth() - (monthsBack - 1));
  const from = inizioMese.toISOString().slice(0, 10);

  return all(
    `SELECT strftime('%Y-%m', ${dateCol}) AS month, ROUND(SUM(amount), 2) AS total
     FROM ${table} WHERE user_id = ? AND ${dateCol} >= ? AND is_transfer = 0
     GROUP BY month ORDER BY month ASC`,
    userId, from,
  ).map((r) => ({ month: r.month, total: Number(r.total) }));
};

/** Somma per classe di attivo di titoli e PAC, che il report mostra insieme. */
function pacSummary(userId) {
  const plans = all(
    `SELECT p.id, p.fund_id, f.asset_class_id, ac.name AS asset_class_name, ac.color AS asset_class_color,
            (SELECT n.nav FROM pac_fund_navs n WHERE n.fund_id = f.id ORDER BY n.nav_date DESC LIMIT 1) AS last_nav
     FROM pac_plans p
     INNER JOIN pac_funds f ON f.id = p.fund_id
     LEFT JOIN asset_classes ac ON ac.id = f.asset_class_id
     WHERE p.user_id = ?`,
    userId,
  );

  let invested = 0;
  let current = 0;
  let pnl = 0;
  let hasMarked = false;
  const byClass = new Map();

  for (const plan of plans) {
    const s = one(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount, COALESCE(SUM(units), 0) AS total_units
       FROM pac_contributions WHERE plan_id = ?`,
      plan.id,
    );
    const totalAmount = Number(s.total_amount);
    const totalUnits = Number(s.total_units);
    const lastNav = plan.last_nav === null || plan.last_nav === undefined ? null : Number(plan.last_nav);

    invested += totalAmount;
    let valore = null;
    if (lastNav !== null && totalUnits > 0) {
      valore = totalUnits * lastNav;
      current += valore;
      pnl += valore - totalAmount;
      hasMarked = true;
    }

    const key = plan.asset_class_id ?? 0;
    if (!byClass.has(key)) {
      byClass.set(key, {
        asset_class_id: plan.asset_class_id ?? null,
        asset_class_name: plan.asset_class_name ?? 'Senza classe',
        asset_class_color: plan.asset_class_color ?? '#6c757d',
        invested: 0, current: 0, hasMarked: false,
      });
    }
    const g = byClass.get(key);
    g.invested += totalAmount;
    if (valore !== null) { g.current += valore; g.hasMarked = true; }
  }

  return { invested, current, pnl, hasMarked, byClass };
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function investmentsKpi(userId) {
  const holdings = holdingsForUser(userId);

  let invested = 0;
  let current = 0;
  let hasMarked = false;
  for (const h of holdings) {
    invested += h.qty * h.avg_cost;
    if (h.mark_value !== null) { current += h.mark_value; hasMarked = true; }
  }

  const pac = pacSummary(userId);
  if (pac.hasMarked) hasMarked = true;

  const totalInvested = invested + pac.invested;
  const totalCurrent = hasMarked ? current + pac.current : null;

  return {
    has_data: totalInvested > 0,
    total_invested: round2(totalInvested),
    total_current: totalCurrent !== null ? round2(totalCurrent) : null,
    total_pnl: totalCurrent !== null ? round2(totalCurrent - totalInvested) : null,
    by_asset_class: holdingsByAssetClass(userId),
  };
}

async function dashboardData(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  // Le ricorrenze arretrate si materializzano qui, come faceva l'index PHP.
  // I versamenti PAC no: si marcano sui movimenti dell'estratto conto, dove i
  // soldi sono usciti davvero (routes/pac.js::setExpenseSplit).
  try { generatePending(userId); } catch { /* non deve bloccare la dashboard */ }

  const fromIn = str(searchParams.get('from'));
  const toIn = str(searchParams.get('to'));

  let from;
  let to;
  if (isValidDate(fromIn) && isValidDate(toIn) && fromIn <= toIn) {
    from = fromIn;
    to = toIn;
  } else {
    const today = new Date();
    const primo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const ultimo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    from = primo.toISOString().slice(0, 10);
    to = ultimo.toISOString().slice(0, 10);
  }

  const giorni = Math.max(1, Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const prevTo = new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(Date.parse(prevTo) - (giorni - 1) * 86400000).toISOString().slice(0, 10);
  const meseCorrente = new Date().toISOString().slice(0, 7);

  const totalCurrent = totalForRange('expenses', 'expense_date', userId, from, to);
  const totalPrevious = totalForRange('expenses', 'expense_date', userId, prevFrom, prevTo);
  const incomeCurrent = totalForRange('incomes', 'income_date', userId, from, to);
  const incomePrevious = totalForRange('incomes', 'income_date', userId, prevFrom, prevTo);

  const byCategory = all(
    `SELECT e.category_id, COALESCE(c.name, 'Senza categoria') AS name,
            COALESCE(c.color, '#6c757d') AS color, c.icon AS icon, SUM(e.amount) AS total
     FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date <= ? AND e.is_transfer = 0
     GROUP BY e.category_id, c.name, c.color, c.icon
     ORDER BY total DESC`,
    userId, from, to,
  ).map((r) => ({
    category_id: r.category_id ?? null,
    name: r.name,
    color: r.color,
    icon: r.icon ?? null,
    total: Number(r.total),
  }));

  ok(res, {
    range: { from, to, days: giorni, prev_from: prevFrom, prev_to: prevTo },
    current_month: meseCorrente,
    totals: {
      current: round2(totalCurrent),
      previous: round2(totalPrevious),
      // Senza un periodo precedente la variazione non esiste: null, non zero.
      delta_pct: totalPrevious > 0
        ? roundLikePhp(((totalCurrent - totalPrevious) / totalPrevious) * 100, 1)
        : null,
      income_current: round2(incomeCurrent),
      income_previous: round2(incomePrevious),
      net_current: round2(incomeCurrent - totalCurrent),
    },
    by_category: byCategory,
    by_month: totalsByMonth('expenses', 'expense_date', userId, 6),
    income_by_month: totalsByMonth('incomes', 'income_date', userId, 6),
    budget_progress: progressForMonth(userId, meseCorrente),
    investments: investmentsKpi(userId),
  });
}

// ─── Report annuale ─────────────────────────────────────────────────────────

function investmentsOverview(userId, start, end) {
  const holdings = holdingsForUser(userId);

  let secInvested = 0;
  let secCurrent = 0;
  let secDividends = 0;
  let secPnl = 0;
  let hasMarkedSec = false;
  for (const h of holdings) {
    secInvested += h.qty * h.avg_cost;
    if (h.mark_value !== null) { secCurrent += h.mark_value; hasMarkedSec = true; }
    secDividends += h.dividends;
    secPnl += h.total_pnl;
  }

  const pac = pacSummary(userId);

  // Titoli e PAC confluiscono nella stessa classe di attivo.
  const merged = new Map();
  for (const row of holdingsByAssetClass(userId)) {
    merged.set(row.asset_class_id ?? 0, {
      asset_class_id: row.asset_class_id,
      asset_class_name: row.asset_class_name,
      asset_class_color: row.asset_class_color,
      invested: row.invested,
      current: row.current ?? 0,
      hasMarked: row.current !== null,
      dividends: row.dividends,
    });
  }
  for (const [key, row] of pac.byClass) {
    if (!merged.has(key)) {
      merged.set(key, {
        asset_class_id: row.asset_class_id,
        asset_class_name: row.asset_class_name,
        asset_class_color: row.asset_class_color,
        invested: 0, current: 0, hasMarked: false, dividends: 0,
      });
    }
    const g = merged.get(key);
    g.invested += row.invested;
    if (row.hasMarked) { g.current += row.current; g.hasMarked = true; }
  }

  const byAssetClass = [...merged.values()].map((r) => ({
    asset_class_id: r.asset_class_id,
    asset_class_name: r.asset_class_name,
    asset_class_color: r.asset_class_color,
    invested: round2(r.invested),
    current: r.hasMarked ? round2(r.current) : null,
    pnl: r.hasMarked ? round2(r.current - r.invested) : null,
    dividends: round2(r.dividends ?? 0),
  }));

  const divByMonth = Array(12).fill(0);
  for (const r of all(
    `SELECT CAST(strftime('%m', trade_date) AS INTEGER) AS m, SUM(net_amount) AS total
     FROM securities_transactions
     WHERE user_id = ? AND kind = 'DIVIDEND' AND trade_date >= ? AND trade_date < ?
     GROUP BY m`,
    userId, start, end,
  )) {
    divByMonth[r.m - 1] = round2(Number(r.total));
  }

  const totalInvested = secInvested + pac.invested;
  const hasMarked = hasMarkedSec || pac.hasMarked;
  const totalCurrent = hasMarked ? secCurrent + pac.current : null;

  return {
    has_data: totalInvested > 0,
    total_invested: round2(totalInvested),
    total_current: totalCurrent !== null ? round2(totalCurrent) : null,
    total_pnl: totalCurrent !== null ? round2(totalCurrent - totalInvested) : null,
    total_dividends_year: round2(divByMonth.reduce((a, b) => a + b, 0)),
    securities_invested: round2(secInvested),
    securities_current: hasMarkedSec ? round2(secCurrent) : null,
    securities_dividends: round2(secDividends),
    securities_pnl: round2(secPnl),
    pac_invested: round2(pac.invested),
    pac_current: pac.hasMarked ? round2(pac.current) : null,
    pac_pnl: pac.hasMarked ? round2(pac.pnl) : null,
    by_asset_class: byAssetClass,
    dividends_by_month: divByMonth,
  };
}

async function reportYear(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const year = int(searchParams.get('year'), new Date().getFullYear());
  if (year < 1900 || year > 2100) throw HttpError.badRequest('Anno non valido.');

  const start = `${String(year).padStart(4, '0')}-01-01`;
  const end = `${String(year + 1).padStart(4, '0')}-01-01`;

  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    month: `${String(year).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`,
    expenses: 0,
    incomes: 0,
    net: 0,
  }));

  const perMese = (table, dateCol) => all(
    `SELECT CAST(strftime('%m', ${dateCol}) AS INTEGER) AS m, SUM(amount) AS total
     FROM ${table} WHERE user_id = ? AND ${dateCol} >= ? AND ${dateCol} < ? AND is_transfer = 0
     GROUP BY m`,
    userId, start, end,
  );
  for (const r of perMese('expenses', 'expense_date')) byMonth[r.m - 1].expenses = round2(Number(r.total));
  for (const r of perMese('incomes', 'income_date')) byMonth[r.m - 1].incomes = round2(Number(r.total));

  let totalExp = 0;
  let totalInc = 0;
  for (const row of byMonth) {
    row.net = round2(row.incomes - row.expenses);
    totalExp += row.expenses;
    totalInc += row.incomes;
  }

  const byCategory = all(
    `SELECT COALESCE(c.name, 'Senza categoria') AS name, COALESCE(c.color, '#6c757d') AS color,
            c.id AS category_id, SUM(e.amount) AS total
     FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date < ? AND e.is_transfer = 0
     GROUP BY c.id, c.name, c.color ORDER BY total DESC`,
    userId, start, end,
  ).map((r) => {
    const tot = Number(r.total);
    return {
      category_id: r.category_id ?? null,
      name: r.name,
      color: r.color,
      total: round2(tot),
      pct: totalExp > 0 ? roundLikePhp((tot / totalExp) * 100, 1) : 0,
    };
  });

  const topExpenses = all(
    `SELECT e.id, e.expense_date, e.description, e.amount, e.payment_method,
            COALESCE(c.name, 'Senza categoria') AS category_name,
            COALESCE(c.color, '#6c757d') AS category_color
     FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date < ? AND e.is_transfer = 0
     ORDER BY e.amount DESC, e.expense_date DESC LIMIT 10`,
    userId, start, end,
  ).map((r) => ({
    id: r.id,
    expense_date: r.expense_date,
    description: r.description ?? null,
    amount: round2(Number(r.amount)),
    payment_method: r.payment_method,
    category_name: r.category_name,
    category_color: r.category_color,
  }));

  // Mappa di calore: le cinque categorie principali, mese per mese.
  const topCats = byCategory.slice(0, 5);
  const heatmap = { categories: topCats, matrix: [] };
  for (const tc of topCats) {
    const months = Array(12).fill(0);
    const rows = tc.category_id !== null
      ? all(
        `SELECT CAST(strftime('%m', expense_date) AS INTEGER) AS m, SUM(amount) AS total
         FROM expenses WHERE user_id = ? AND category_id = ?
           AND expense_date >= ? AND expense_date < ? AND is_transfer = 0 GROUP BY m`,
        userId, tc.category_id, start, end,
      )
      : all(
        `SELECT CAST(strftime('%m', expense_date) AS INTEGER) AS m, SUM(amount) AS total
         FROM expenses WHERE user_id = ? AND category_id IS NULL
           AND expense_date >= ? AND expense_date < ? AND is_transfer = 0 GROUP BY m`,
        userId, start, end,
      );
    for (const r of rows) months[r.m - 1] = round2(Number(r.total));
    heatmap.matrix.push({ category_id: tc.category_id, name: tc.name, color: tc.color, months });
  }

  // La media mensile conta solo i mesi in cui si e' speso qualcosa.
  const mesiConSpese = byMonth.filter((r) => r.expenses > 0);
  const ordinati = [...mesiConSpese].sort((a, b) => b.expenses - a.expenses);

  ok(res, {
    year,
    total_expenses: round2(totalExp),
    total_incomes: round2(totalInc),
    net: round2(totalInc - totalExp),
    monthly_avg: mesiConSpese.length > 0 ? round2(totalExp / mesiConSpese.length) : 0,
    max_month: ordinati[0] ?? null,
    min_month: ordinati.length > 0 ? ordinati[ordinati.length - 1] : null,
    by_month: byMonth,
    by_category: byCategory,
    top_expenses: topExpenses,
    heatmap,
    investments: investmentsOverview(userId, start, end),
  });
}

export const reportRoutes = {
  'GET /dashboard/data': dashboardData,
  'GET /reports/year': reportYear,
};
