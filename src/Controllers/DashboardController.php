<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Budget;
use App\Expense;
use App\Http\Request;
use App\Http\Response;
use App\Income;
use App\Models\Repositories\HoldingsRepository;
use App\Models\Repositories\PacContributionRepository;
use App\Models\Repositories\PacFundRepository;
use App\Models\Repositories\PacPlanRepository;
use App\RecurringExpense;
use App\Services\PacService;
use Throwable;

/**
 * Dashboard. Sostituisce pages/dashboard.php + endpoints/dashboard_data.php.
 *
 * generatePending() viene invocato all'index() per espandere le ricorrenze
 * pendenti (idempotente via last_generated_date), come da piano sez. 8.
 */
final class DashboardController extends BaseController
{
    /** GET /dashboard -- pagina HTML. */
    public function index(Request $request): Response
    {
        $userId = $this->userId();
        try {
            RecurringExpense::generatePending($userId);
        } catch (Throwable) {
            /* silent -- come public/index.php:84 */
        }
        try {
            (new PacService())->generatePending($userId);
        } catch (Throwable) {
            /* silent: PAC auto-generation non blocca il dashboard */
        }
        return $this->view('dashboard.index', ['title' => 'Dashboard']);
    }

    /** GET /dashboard/data -- JSON envelope con aggregati. */
    public function data(Request $request): Response
    {
        $userId = $this->userId();
        $isIso  = static fn(?string $s): bool => is_string($s) && (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $s);

        $fromIn = $request->query('from');
        $toIn   = $request->query('to');
        $fromIn = is_string($fromIn) ? $fromIn : null;
        $toIn   = is_string($toIn)   ? $toIn   : null;
        if ($isIso($fromIn) && $isIso($toIn) && $fromIn <= $toIn) {
            $from = (string) $fromIn;
            $to   = (string) $toIn;
        } else {
            $from = date('Y-m-01');
            $to   = date('Y-m-d', (int) strtotime('last day of this month'));
        }

        $daysInRange = max(1, (int) floor((strtotime($to) - strtotime($from)) / 86400) + 1);
        $prevTo   = date('Y-m-d', (int) strtotime($from . ' -1 day'));
        $prevFrom = date('Y-m-d', (int) strtotime($prevTo . ' -' . ($daysInRange - 1) . ' days'));
        $currentMonth = date('Y-m');

        $totalCurrent  = Expense::totalForRange($userId, $from, $to);
        $totalPrevious = Expense::totalForRange($userId, $prevFrom, $prevTo);
        $deltaPct      = $totalPrevious > 0
            ? (($totalCurrent - $totalPrevious) / $totalPrevious) * 100.0
            : null;

        $incomeCurrent  = Income::totalForRange($userId, $from, $to);
        $incomePrevious = Income::totalForRange($userId, $prevFrom, $prevTo);
        $netCurrent     = $incomeCurrent - $totalCurrent;

        $byCategory     = Expense::totalsByCategoryForRange($userId, $from, $to);
        $byMonth        = Expense::totalsByMonth($userId, 6);
        $incomeByMonth  = Income::totalsByMonth($userId, 6);
        $budgetProgress = Budget::progressForMonth($userId, $currentMonth);

        $investments = $this->buildInvestmentsKpi($userId);

        return $this->json([
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
            'investments'     => $investments,
        ]);
    }

    /**
     * KPI investimenti per il widget dashboard.
     *
     * @return array<string,mixed>
     */
    private function buildInvestmentsKpi(int $userId): array
    {
        $holdingsRepo = new HoldingsRepository();
        $byAssetClass = $holdingsRepo->byAssetClass($userId);
        $holdings     = $holdingsRepo->forUser($userId);

        $invested  = 0.0;
        $current   = 0.0;
        $hasMarked = false;
        foreach ($holdings as $h) {
            $invested += $h['qty'] * $h['avg_cost'];
            if ($h['mark_value'] !== null) {
                $current   += $h['mark_value'];
                $hasMarked  = true;
            }
        }

        $pacInvested = 0.0;
        $pacCurrent  = 0.0;
        $pacPlans    = (new PacPlanRepository())->listForUser($userId);
        $contRepo    = new PacContributionRepository();
        $fundsRepo   = new PacFundRepository();
        foreach ($pacPlans as $plan) {
            $sum = $contRepo->summaryForPlan($plan->id);
            $pacInvested += $sum['total_amount'];
            $fund = $fundsRepo->findById($plan->fundId, $userId);
            if ($fund !== null && $fund->lastNav !== null && $sum['total_units'] > 0) {
                $pacCurrent += $sum['total_units'] * $fund->lastNav;
                $hasMarked   = true;
            }
        }

        $totalInvested = $invested + $pacInvested;
        $totalCurrent  = $hasMarked ? ($current + $pacCurrent) : null;
        $pnl           = $totalCurrent !== null ? ($totalCurrent - $totalInvested) : null;

        return [
            'has_data'       => $totalInvested > 0,
            'total_invested' => round($totalInvested, 2),
            'total_current'  => $totalCurrent !== null ? round($totalCurrent, 2) : null,
            'total_pnl'      => $pnl !== null ? round($pnl, 2) : null,
            'by_asset_class' => $byAssetClass,
        ];
    }
}
