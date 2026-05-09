<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\Budget;

/**
 * Repository per i budget mensili. Sostituisce le query statiche di
 * src/class/Budget.php.
 */
final class BudgetRepository extends BaseRepository
{
    protected string $table = 'budgets';

    /** @var class-string<Budget> */
    protected string $entityClass = Budget::class;

    /**
     * Budget del mese richiesto, con SUM expenses come `spent`.
     *
     * @return list<Budget>
     */
    public function progressForMonth(int $userId, string $yearMonth): array
    {
        $start = $yearMonth . '-01';
        $end   = date('Y-m-d', (int) strtotime($start . ' +1 month'));
        $rows = $this->fetchAll(
            "SELECT b.id, b.category_id, b.year_month, b.amount,
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
             ORDER BY c.sort_order ASC, c.name ASC",
            [$start, $end, $userId, $yearMonth],
        );
        return array_map(static fn(array $r): Budget => Budget::fromRow($r), $rows);
    }

    /**
     * Stato budget per (categoria, mese) con SUM expenses. Null se la categoria
     * non ha un budget impostato per il mese.
     */
    public function checkForCategory(int $userId, int $categoryId, string $yearMonth): ?Budget
    {
        $start = $yearMonth . '-01';
        $end   = date('Y-m-d', (int) strtotime($start . ' +1 month'));
        $row = $this->fetchOne(
            "SELECT b.id, b.category_id, b.year_month, b.amount,
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
             LIMIT 1",
            [$start, $end, $userId, $categoryId, $yearMonth],
        );
        return $row !== null ? Budget::fromRow($row) : null;
    }

    public function setForMonth(int $userId, int $categoryId, string $yearMonth, string $amount): void
    {
        $this->exec(
            'INSERT INTO budgets (user_id, category_id, year_month, amount)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE amount = VALUES(amount)',
            [$userId, $categoryId, $yearMonth, $amount],
        );
    }

    public function deleteForMonth(int $userId, int $categoryId, string $yearMonth): int
    {
        return $this->exec(
            'DELETE FROM budgets WHERE user_id = ? AND category_id = ? AND year_month = ?',
            [$userId, $categoryId, $yearMonth],
        )->rowCount();
    }
}
