<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;

final class Budget
{
    /**
     * Budget del mese richiesto, con totale speso (JOIN expenses) e residuo.
     *
     * @return array<int, array{
     *   id:int, category_id:int, name:string, color:string, icon:?string,
     *   year_month:string, amount:float, spent:float, remaining:float, progress_pct:float
     * }>
     */
    public static function progressForMonth(int $userId, string $yearMonth): array
    {
        if (!self::isValidYearMonth($yearMonth)) {
            throw new InvalidArgumentException('Mese non valido (formato YYYY-MM).');
        }
        $start = $yearMonth . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
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
             WHERE b.user_id = ? AND b.year_month = ?
             GROUP BY b.id, b.category_id, b.year_month, b.amount, c.name, c.color, c.icon
             ORDER BY c.sort_order ASC, c.name ASC"
        );
        $stmt->execute([$start, $end, $userId, $yearMonth]);

        $rows = [];
        foreach ($stmt->fetchAll() as $r) {
            $amount = (float) $r['amount'];
            $spent  = (float) $r['spent'];
            $rows[] = [
                'id'           => (int) $r['id'],
                'category_id'  => (int) $r['category_id'],
                'name'         => (string) $r['name'],
                'color'        => (string) $r['color'],
                'icon'         => $r['icon'],
                'year_month'   => (string) $r['year_month'],
                'amount'       => round($amount, 2),
                'spent'        => round($spent, 2),
                'remaining'    => round($amount - $spent, 2),
                'progress_pct' => $amount > 0 ? round(($spent / $amount) * 100.0, 1) : 0.0,
            ];
        }
        return $rows;
    }

    public static function setForMonth(int $userId, int $categoryId, string $yearMonth, string|float $amount): int
    {
        if (!self::isValidYearMonth($yearMonth)) {
            throw new InvalidArgumentException('Mese non valido (formato YYYY-MM).');
        }
        $amountF = is_string($amount) ? (float) str_replace(',', '.', $amount) : (float) $amount;
        if ($amountF < 0.01) {
            throw new InvalidArgumentException('Importo non valido (minimo 0.01).');
        }
        if ($amountF > 99999999.99) {
            throw new InvalidArgumentException('Importo troppo grande.');
        }

        $check = Database::pdo()->prepare(
            'SELECT 1 FROM categories WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $check->execute([$categoryId, $userId]);
        if ($check->fetchColumn() === false) {
            throw new InvalidArgumentException('Categoria non trovata.');
        }

        $stmt = Database::pdo()->prepare(
            'INSERT INTO budgets (user_id, category_id, year_month, amount)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE amount = VALUES(amount)'
        );
        $stmt->execute([$userId, $categoryId, $yearMonth, number_format($amountF, 2, '.', '')]);
        return (int) Database::pdo()->lastInsertId();
    }

    /**
     * Stato budget per (categoria, mese). Null se la categoria non ha budget per il mese.
     *
     * @return array{
     *   name:string, amount:float, spent:float, remaining:float, progress_pct:float,
     *   exceeded:bool, near_limit:bool
     * }|null
     */
    public static function checkForCategory(int $userId, ?int $categoryId, string $yearMonth): ?array
    {
        if ($categoryId === null) return null;
        if (!self::isValidYearMonth($yearMonth)) return null;

        $start = $yearMonth . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
            "SELECT b.amount, c.name,
                    COALESCE(SUM(e.amount), 0) AS spent
             FROM budgets b
             INNER JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
             LEFT JOIN expenses e
               ON e.user_id = b.user_id
              AND e.category_id = b.category_id
              AND e.expense_date >= ?
              AND e.expense_date <  ?
             WHERE b.user_id = ? AND b.category_id = ? AND b.year_month = ?
             GROUP BY b.amount, c.name
             LIMIT 1"
        );
        $stmt->execute([$start, $end, $userId, $categoryId, $yearMonth]);
        $row = $stmt->fetch();
        if ($row === false) return null;

        $amount = (float) $row['amount'];
        $spent  = (float) $row['spent'];
        $pct    = $amount > 0 ? ($spent / $amount) * 100.0 : 0.0;

        return [
            'name'         => (string) $row['name'],
            'amount'       => round($amount, 2),
            'spent'        => round($spent, 2),
            'remaining'    => round($amount - $spent, 2),
            'progress_pct' => round($pct, 1),
            'exceeded'     => $spent > $amount,
            'near_limit'   => $pct >= 80.0 && $spent <= $amount,
        ];
    }

    public static function deleteForMonth(int $userId, int $categoryId, string $yearMonth): void
    {
        if (!self::isValidYearMonth($yearMonth)) {
            throw new InvalidArgumentException('Mese non valido (formato YYYY-MM).');
        }
        $stmt = Database::pdo()->prepare(
            'DELETE FROM budgets WHERE user_id = ? AND category_id = ? AND year_month = ?'
        );
        $stmt->execute([$userId, $categoryId, $yearMonth]);
    }

    private static function isValidYearMonth(string $ym): bool
    {
        return (bool) preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym);
    }
}
