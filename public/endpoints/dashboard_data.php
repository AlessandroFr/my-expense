<?php
declare(strict_types=1);

/**
 * GET /dashboard/data — JSON envelope con aggregati per la dashboard.
 *
 * Output:
 *   data.current_month: "YYYY-MM"
 *   data.totals.current:   float (totale mese corrente)
 *   data.totals.previous:  float (totale mese precedente)
 *   data.totals.delta_pct: float|null (variazione % vs mese prec; null se prec = 0)
 *   data.by_category:      [{category_id, name, color, icon, total}]   — mese corrente
 *   data.by_month:         [{month: "YYYY-MM", total: float}]          — ultimi 6 mesi
 */

use App\Auth;
use App\Budget;
use App\Expense;
use App\Income;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}

$userId       = (int) Auth::userId();
$currentMonth = date('Y-m');
$prevMonth    = date('Y-m', strtotime('first day of last month'));

try {
    $totalCurrent  = Expense::monthlyTotal($userId, $currentMonth);
    $totalPrevious = Expense::monthlyTotal($userId, $prevMonth);
    $deltaPct      = $totalPrevious > 0
        ? (($totalCurrent - $totalPrevious) / $totalPrevious) * 100.0
        : null;

    $incomeCurrent  = Income::monthlyTotal($userId, $currentMonth);
    $incomePrevious = Income::monthlyTotal($userId, $prevMonth);
    $netCurrent     = $incomeCurrent - $totalCurrent;

    $byCategory   = Expense::totalsByCategoryForMonth($userId, $currentMonth);
    $byMonth      = Expense::totalsByMonth($userId, 6);
    $incomeByMonth = Income::totalsByMonth($userId, 6);

    $budgetProgress = Budget::progressForMonth($userId, $currentMonth);
} catch (Throwable $e) {
    Json::error('Errore caricamento dashboard: ' . $e->getMessage(), 'server', 500);
}

Json::ok([
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
