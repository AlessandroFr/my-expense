<?php
declare(strict_types=1);

/**
 * GET /dashboard/data — JSON envelope con aggregati per la dashboard.
 *
 * Query params (opzionali):
 *   from / to : range YYYY-MM-DD (inclusive). Default = mese corrente.
 *
 * Output:
 *   data.range.{from, to, days, prev_from, prev_to}: range applicato
 *   data.current_month:           "YYYY-MM" (per il widget budget, decoupled)
 *   data.totals.current:          totale spese nel range
 *   data.totals.previous:         totale spese nel range precedente di pari durata
 *   data.totals.delta_pct:        float|null (null se previous = 0)
 *   data.totals.income_current/previous, net_current
 *   data.by_category:             [{category_id, name, color, icon, total}] — range
 *   data.by_month:                [{month, total}] — ultimi 6 mesi (decoupled)
 *   data.income_by_month:         idem
 *   data.budget_progress:         mese corrente (decoupled)
 */

use App\Auth;
use App\Budget;
use App\Expense;
use App\Income;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();

// ── Risoluzione range (from/to). Default: mese corrente. ────────────────────
$isIso = static fn (?string $s): bool => is_string($s) && (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $s);
$fromIn = $_GET['from'] ?? null;
$toIn   = $_GET['to']   ?? null;
if ($isIso($fromIn) && $isIso($toIn) && $fromIn <= $toIn) {
    $from = (string) $fromIn;
    $to   = (string) $toIn;
} else {
    $from = date('Y-m-01');
    $to   = date('Y-m-d', strtotime('last day of this month'));
}

// Range "precedente" di pari durata, finente il giorno prima di $from.
$daysInRange = max(1, (int) floor((strtotime($to) - strtotime($from)) / 86400) + 1);
$prevTo   = date('Y-m-d', strtotime($from . ' -1 day'));
$prevFrom = date('Y-m-d', strtotime($prevTo . ' -' . ($daysInRange - 1) . ' days'));

$currentMonth = date('Y-m');

try {
    $totalCurrent  = Expense::totalForRange($userId, $from, $to);
    $totalPrevious = Expense::totalForRange($userId, $prevFrom, $prevTo);
    $deltaPct      = $totalPrevious > 0
        ? (($totalCurrent - $totalPrevious) / $totalPrevious) * 100.0
        : null;

    $incomeCurrent  = Income::totalForRange($userId, $from, $to);
    $incomePrevious = Income::totalForRange($userId, $prevFrom, $prevTo);
    $netCurrent     = $incomeCurrent - $totalCurrent;

    $byCategory    = Expense::totalsByCategoryForRange($userId, $from, $to);
    $byMonth       = Expense::totalsByMonth($userId, 6);
    $incomeByMonth = Income::totalsByMonth($userId, 6);

    $budgetProgress = Budget::progressForMonth($userId, $currentMonth);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'range' => [
        'from'      => $from,
        'to'        => $to,
        'days'      => $daysInRange,
        'prev_from' => $prevFrom,
        'prev_to'   => $prevTo,
    ],
    'current_month' => $currentMonth,
    'totals' => [
        'current'         => round($totalCurrent, 2),
        'previous'        => round($totalPrevious, 2),
        'delta_pct'       => $deltaPct === null ? null : round($deltaPct, 1),
        'income_current'  => round($incomeCurrent, 2),
        'income_previous' => round($incomePrevious, 2),
        'net_current'     => round($netCurrent, 2),
    ],
    'by_category'     => $byCategory,
    'by_month'        => $byMonth,
    'income_by_month' => $incomeByMonth,
    'budget_progress' => $budgetProgress,
]);
