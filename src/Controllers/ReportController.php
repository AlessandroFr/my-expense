<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Models\Repositories\HoldingsRepository;
use App\Models\Repositories\PacContributionRepository;
use App\Models\Repositories\PacFundRepository;
use App\Models\Repositories\PacPlanRepository;

/**
 * Report annuale. Sostituisce pages/reports.php + endpoints/reports_year.php.
 */
final class ReportController extends BaseController
{
    /** GET /reports */
    public function index(Request $request): Response
    {
        return $this->view('reports.index', ['title' => 'Report annuale']);
    }

    /** GET /reports/year?year=YYYY */
    public function year(Request $request): Response
    {
        $userId = $this->userId();
        $year   = (int) ($request->query('year') ?? date('Y'));
        if ($year < 1900 || $year > 2100) {
            throw HttpException::badRequest('Anno non valido.');
        }

        $start = sprintf('%04d-01-01', $year);
        $end   = sprintf('%04d-01-01', $year + 1);
        $pdo   = Database::pdo();

        $byMonth = [];
        for ($m = 1; $m <= 12; $m++) {
            $byMonth[$m] = [
                'month'    => sprintf('%04d-%02d', $year, $m),
                'expenses' => 0.0,
                'incomes'  => 0.0,
                'net'      => 0.0,
            ];
        }

        $stmt = $pdo->prepare(
            "SELECT MONTH(expense_date) AS m, SUM(amount) AS total
             FROM expenses
             WHERE user_id = ? AND expense_date >= ? AND expense_date < ?
               AND is_transfer = 0
             GROUP BY m"
        );
        $stmt->execute([$userId, $start, $end]);
        foreach ($stmt->fetchAll() as $r) {
            $byMonth[(int) $r['m']]['expenses'] = round((float) $r['total'], 2);
        }

        $stmt = $pdo->prepare(
            "SELECT MONTH(income_date) AS m, SUM(amount) AS total
             FROM incomes
             WHERE user_id = ? AND income_date >= ? AND income_date < ?
               AND is_transfer = 0
             GROUP BY m"
        );
        $stmt->execute([$userId, $start, $end]);
        foreach ($stmt->fetchAll() as $r) {
            $byMonth[(int) $r['m']]['incomes'] = round((float) $r['total'], 2);
        }

        $totalExp = 0.0;
        $totalInc = 0.0;
        foreach ($byMonth as &$row) {
            $row['net'] = round($row['incomes'] - $row['expenses'], 2);
            $totalExp += $row['expenses'];
            $totalInc += $row['incomes'];
        }
        unset($row);
        $byMonth = array_values($byMonth);

        $stmt = $pdo->prepare(
            "SELECT
                 COALESCE(c.name, 'Senza categoria') AS name,
                 COALESCE(c.color, '#6c757d')         AS color,
                 c.id                                  AS category_id,
                 SUM(e.amount)                         AS total
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date < ?
               AND e.is_transfer = 0
             GROUP BY c.id, c.name, c.color
             ORDER BY total DESC"
        );
        $stmt->execute([$userId, $start, $end]);
        $byCategory = [];
        foreach ($stmt->fetchAll() as $r) {
            $tot = (float) $r['total'];
            $byCategory[] = [
                'category_id' => $r['category_id'] === null ? null : (int) $r['category_id'],
                'name'        => (string) $r['name'],
                'color'       => (string) $r['color'],
                'total'       => round($tot, 2),
                'pct'         => $totalExp > 0 ? round(($tot / $totalExp) * 100.0, 1) : 0.0,
            ];
        }

        $stmt = $pdo->prepare(
            "SELECT e.id, e.expense_date, e.description, e.amount, e.payment_method,
                    COALESCE(c.name, 'Senza categoria') AS category_name,
                    COALESCE(c.color, '#6c757d')         AS category_color
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date < ?
               AND e.is_transfer = 0
             ORDER BY e.amount DESC, e.expense_date DESC
             LIMIT 10"
        );
        $stmt->execute([$userId, $start, $end]);
        $topExpenses = array_map(static fn(array $r): array => [
            'id'             => (int) $r['id'],
            'expense_date'   => (string) $r['expense_date'],
            'description'    => $r['description'],
            'amount'         => round((float) $r['amount'], 2),
            'payment_method' => (string) $r['payment_method'],
            'category_name'  => (string) $r['category_name'],
            'category_color' => (string) $r['category_color'],
        ], $stmt->fetchAll());

        $topCats = array_slice($byCategory, 0, 5);
        $heatmap = ['categories' => $topCats, 'matrix' => []];
        foreach ($topCats as $tc) {
            $row = [
                'category_id' => $tc['category_id'],
                'name'        => $tc['name'],
                'color'       => $tc['color'],
                'months'      => array_fill(0, 12, 0.0),
            ];
            if ($tc['category_id'] !== null) {
                $stmt = $pdo->prepare(
                    "SELECT MONTH(expense_date) AS m, SUM(amount) AS total
                     FROM expenses
                     WHERE user_id = ? AND category_id = ? AND expense_date >= ? AND expense_date < ?
                       AND is_transfer = 0
                     GROUP BY m"
                );
                $stmt->execute([$userId, $tc['category_id'], $start, $end]);
            } else {
                $stmt = $pdo->prepare(
                    "SELECT MONTH(expense_date) AS m, SUM(amount) AS total
                     FROM expenses
                     WHERE user_id = ? AND category_id IS NULL AND expense_date >= ? AND expense_date < ?
                       AND is_transfer = 0
                     GROUP BY m"
                );
                $stmt->execute([$userId, $start, $end]);
            }
            foreach ($stmt->fetchAll() as $hr) {
                $row['months'][(int) $hr['m'] - 1] = round((float) $hr['total'], 2);
            }
            $heatmap['matrix'][] = $row;
        }

        $monthsWithExp = array_filter($byMonth, fn($r) => $r['expenses'] > 0);
        $maxMonth = null;
        $minMonth = null;
        if ($monthsWithExp !== []) {
            $sorted = array_values($monthsWithExp);
            usort($sorted, fn($a, $b) => $b['expenses'] <=> $a['expenses']);
            $maxMonth = $sorted[0];
            $minMonth = end($sorted);
        }
        $monthlyAvg = $monthsWithExp !== [] ? round($totalExp / count($monthsWithExp), 2) : 0.0;

        $investments = $this->buildInvestmentsOverview($userId, $start, $end);

        return $this->json([
            'year'           => $year,
            'total_expenses' => round($totalExp, 2),
            'total_incomes'  => round($totalInc, 2),
            'net'            => round($totalInc - $totalExp, 2),
            'monthly_avg'    => $monthlyAvg,
            'max_month'      => $maxMonth,
            'min_month'      => $minMonth,
            'by_month'       => $byMonth,
            'by_category'    => $byCategory,
            'top_expenses'   => $topExpenses,
            'heatmap'        => $heatmap,
            'investments'    => $investments,
        ]);
    }

    /**
     * Sezione Investimenti del report annuale: KPI portafoglio (deposit
     * titoli + PAC), aggregati per asset class, dividendi mensili dell'anno.
     *
     * @return array<string,mixed>
     */
    private function buildInvestmentsOverview(int $userId, string $start, string $end): array
    {
        $holdings = (new HoldingsRepository())->forUser($userId);

        // Securities portfolio
        $securitiesInvested = 0.0;
        $securitiesCurrent  = 0.0;
        $securitiesDiv      = 0.0;
        $securitiesPnl      = 0.0;
        $hasMarkedSec       = false;
        foreach ($holdings as $h) {
            $securitiesInvested += $h['qty'] * $h['avg_cost'];
            if ($h['mark_value'] !== null) {
                $securitiesCurrent += $h['mark_value'];
                $hasMarkedSec       = true;
            }
            $securitiesDiv += $h['dividends'];
            $securitiesPnl += $h['total_pnl'];
        }

        $byAssetClass = (new HoldingsRepository())->byAssetClass($userId);

        // PAC portfolio (somma piani)
        $pacInvested  = 0.0;
        $pacCurrent   = 0.0;
        $hasMarkedPac = false;
        $pacPnl       = 0.0;
        $pacByClass   = [];

        $plansRepo = new PacPlanRepository();
        $fundsRepo = new PacFundRepository();
        $contRepo  = new PacContributionRepository();
        foreach ($plansRepo->listForUser($userId) as $plan) {
            $sum = $contRepo->summaryForPlan($plan->id);
            $pacInvested += $sum['total_amount'];
            $fund = $fundsRepo->findById($plan->fundId, $userId);
            $current = null;
            if ($fund !== null && $fund->lastNav !== null && $sum['total_units'] > 0) {
                $current = $sum['total_units'] * $fund->lastNav;
                $pacCurrent  += $current;
                $hasMarkedPac = true;
                $pacPnl      += $current - $sum['total_amount'];
            }
            $key = $fund?->assetClassId ?? 0;
            if (!isset($pacByClass[$key])) {
                $pacByClass[$key] = [
                    'asset_class_id'    => $fund?->assetClassId,
                    'asset_class_name'  => $fund?->assetClassName ?? 'Senza classe',
                    'asset_class_color' => $fund?->assetClassColor ?? '#6c757d',
                    'invested'          => 0.0,
                    'current'           => 0.0,
                    'has_marked'        => false,
                ];
            }
            $pacByClass[$key]['invested'] += $sum['total_amount'];
            if ($current !== null) {
                $pacByClass[$key]['current']    += $current;
                $pacByClass[$key]['has_marked']  = true;
            }
        }

        // Merge securities + PAC per asset class
        $merged = [];
        foreach ($byAssetClass as $row) {
            $key = $row['asset_class_id'] ?? 0;
            $merged[$key] = [
                'asset_class_id'    => $row['asset_class_id'],
                'asset_class_name'  => $row['asset_class_name'],
                'asset_class_color' => $row['asset_class_color'],
                'invested'          => $row['invested'],
                'current'           => $row['current'] ?? 0.0,
                'has_marked'        => $row['current'] !== null,
                'dividends'         => $row['dividends'],
            ];
        }
        foreach ($pacByClass as $key => $row) {
            if (!isset($merged[$key])) {
                $merged[$key] = [
                    'asset_class_id'    => $row['asset_class_id'],
                    'asset_class_name'  => $row['asset_class_name'],
                    'asset_class_color' => $row['asset_class_color'],
                    'invested'          => 0.0,
                    'current'           => 0.0,
                    'has_marked'        => false,
                    'dividends'         => 0.0,
                ];
            }
            $merged[$key]['invested'] += $row['invested'];
            if ($row['has_marked']) {
                $merged[$key]['current']    += $row['current'];
                $merged[$key]['has_marked']  = true;
            }
        }
        $byClassOut = array_values(array_map(static fn(array $r): array => [
            'asset_class_id'    => $r['asset_class_id'],
            'asset_class_name'  => $r['asset_class_name'],
            'asset_class_color' => $r['asset_class_color'],
            'invested'          => round($r['invested'], 2),
            'current'           => $r['has_marked'] ? round($r['current'], 2) : null,
            'pnl'               => $r['has_marked'] ? round($r['current'] - $r['invested'], 2) : null,
            'dividends'         => round($r['dividends'] ?? 0, 2),
        ], $merged));

        // Dividendi mensili dell'anno
        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            "SELECT MONTH(trade_date) AS m, SUM(net_amount) AS total
             FROM securities_transactions
             WHERE user_id = ? AND kind = 'DIVIDEND' AND trade_date >= ? AND trade_date < ?
             GROUP BY m"
        );
        $stmt->execute([$userId, $start, $end]);
        $divByMonth = array_fill(1, 12, 0.0);
        foreach ($stmt->fetchAll() as $r) {
            $divByMonth[(int) $r['m']] = round((float) $r['total'], 2);
        }

        $totalInvested = $securitiesInvested + $pacInvested;
        $totalCurrent  = ($hasMarkedSec || $hasMarkedPac) ? ($securitiesCurrent + $pacCurrent) : null;
        $totalPnl      = $totalCurrent !== null ? ($totalCurrent - $totalInvested) : null;

        return [
            'has_data'                => $totalInvested > 0,
            'total_invested'          => round($totalInvested, 2),
            'total_current'           => $totalCurrent !== null ? round($totalCurrent, 2) : null,
            'total_pnl'               => $totalPnl !== null ? round($totalPnl, 2) : null,
            'total_dividends_year'    => round(array_sum($divByMonth), 2),
            'securities_invested'     => round($securitiesInvested, 2),
            'securities_current'      => $hasMarkedSec ? round($securitiesCurrent, 2) : null,
            'securities_dividends'    => round($securitiesDiv, 2),
            'securities_pnl'          => round($securitiesPnl, 2),
            'pac_invested'            => round($pacInvested, 2),
            'pac_current'             => $hasMarkedPac ? round($pacCurrent, 2) : null,
            'pac_pnl'                 => $hasMarkedPac ? round($pacPnl, 2) : null,
            'by_asset_class'          => $byClassOut,
            'dividends_by_month'      => array_values($divByMonth),
        ];
    }
}
