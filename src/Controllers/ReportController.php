<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;

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
                     GROUP BY m"
                );
                $stmt->execute([$userId, $tc['category_id'], $start, $end]);
            } else {
                $stmt = $pdo->prepare(
                    "SELECT MONTH(expense_date) AS m, SUM(amount) AS total
                     FROM expenses
                     WHERE user_id = ? AND category_id IS NULL AND expense_date >= ? AND expense_date < ?
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
        ]);
    }
}
