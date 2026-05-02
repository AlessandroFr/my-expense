<?php
declare(strict_types=1);

namespace App;

use DateTime;
use InvalidArgumentException;

final class Expense
{
    public const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

    /**
     * @param array{
     *   date_from?: ?string, date_to?: ?string,
     *   category_id?: ?int, amount_min?: ?float, amount_max?: ?float,
     *   search?: ?string, limit?: int, offset?: int
     * } $filters
     * @return array<int, array<string,mixed>>
     */
    public static function listForUser(int $userId, array $filters = []): array
    {
        [$where, $params] = self::buildWhere($userId, $filters);

        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $sql = "SELECT e.id, e.user_id, e.category_id, e.amount, e.description,
                       e.payment_method, e.expense_date, e.created_at, e.updated_at,
                       c.name  AS category_name,
                       c.color AS category_color,
                       c.icon  AS category_icon
                FROM expenses e
                LEFT JOIN categories c ON c.id = e.category_id
                {$where}
                ORDER BY e.expense_date DESC, e.id DESC
                LIMIT {$limit} OFFSET {$offset}";

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT e.id, e.user_id, e.category_id, e.amount, e.description,
                    e.payment_method, e.expense_date, e.created_at, e.updated_at,
                    c.name AS category_name, c.color AS category_color, c.icon AS category_icon
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.id = ? AND e.user_id = ?
             LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function create(
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $expenseDate
    ): int {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate);

        $stmt = Database::pdo()->prepare(
            'INSERT INTO expenses (user_id, category_id, amount, description, payment_method, expense_date)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $row['category_id'],
            $row['amount'],
            $row['description'],
            $row['payment_method'],
            $row['expense_date'],
        ]);

        return (int) Database::pdo()->lastInsertId();
    }

    public static function update(
        int $id,
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $expenseDate
    ): void {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate);

        $stmt = Database::pdo()->prepare(
            'UPDATE expenses
             SET category_id = ?, amount = ?, description = ?, payment_method = ?, expense_date = ?
             WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([
            $row['category_id'],
            $row['amount'],
            $row['description'],
            $row['payment_method'],
            $row['expense_date'],
            $id,
            $userId,
        ]);
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'DELETE FROM expenses WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    /**
     * Totale del mese specificato (YYYY-MM, default mese odierno).
     */
    public static function monthlyTotal(int $userId, ?string $yearMonth = null): float
    {
        $ym = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(amount), 0)
             FROM expenses
             WHERE user_id = ? AND expense_date >= ? AND expense_date < ?'
        );
        $stmt->execute([$userId, $start, $end]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * Aggregato per categoria nel mese specificato (YYYY-MM).
     * @return array<int, array{category_id: ?int, name: string, color: string, icon: ?string, total: float}>
     */
    public static function totalsByCategoryForMonth(int $userId, ?string $yearMonth = null): array
    {
        $ym = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
            "SELECT
                e.category_id,
                COALESCE(c.name, 'Senza categoria') AS name,
                COALESCE(c.color, '#6c757d')         AS color,
                c.icon                                AS icon,
                SUM(e.amount)                         AS total
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date < ?
             GROUP BY e.category_id, c.name, c.color, c.icon
             ORDER BY total DESC"
        );
        $stmt->execute([$userId, $start, $end]);
        return array_map(static function (array $r): array {
            return [
                'category_id' => $r['category_id'] === null ? null : (int) $r['category_id'],
                'name'        => (string) $r['name'],
                'color'       => (string) $r['color'],
                'icon'        => $r['icon'],
                'total'       => (float) $r['total'],
            ];
        }, $stmt->fetchAll());
    }

    /**
     * Totali per gli ultimi N mesi (default 6), ordinati cronologicamente.
     * @return array<int, array{month: string, total: float}>
     */
    public static function totalsByMonth(int $userId, int $monthsBack = 6): array
    {
        $monthsBack = max(1, min(36, $monthsBack));
        $stmt = Database::pdo()->prepare(
            "SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month,
                    SUM(amount) AS total
             FROM expenses
             WHERE user_id = ?
               AND expense_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
             GROUP BY month
             ORDER BY month ASC"
        );
        $stmt->execute([$userId, $monthsBack - 1]);
        return array_map(static function (array $r): array {
            return ['month' => (string) $r['month'], 'total' => (float) $r['total']];
        }, $stmt->fetchAll());
    }

    /**
     * @return array{0: string, 1: array<int|string, mixed>}
     */
    private static function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['e.user_id = ?'];
        $params  = [$userId];

        if (!empty($filters['date_from']) && self::isValidDate((string) $filters['date_from'])) {
            $clauses[] = 'e.expense_date >= ?';
            $params[]  = $filters['date_from'];
        }
        if (!empty($filters['date_to']) && self::isValidDate((string) $filters['date_to'])) {
            $clauses[] = 'e.expense_date <= ?';
            $params[]  = $filters['date_to'];
        }
        if (!empty($filters['category_id'])) {
            $clauses[] = 'e.category_id = ?';
            $params[]  = (int) $filters['category_id'];
        }
        if (isset($filters['amount_min']) && $filters['amount_min'] !== '' && $filters['amount_min'] !== null) {
            $clauses[] = 'e.amount >= ?';
            $params[]  = (float) $filters['amount_min'];
        }
        if (isset($filters['amount_max']) && $filters['amount_max'] !== '' && $filters['amount_max'] !== null) {
            $clauses[] = 'e.amount <= ?';
            $params[]  = (float) $filters['amount_max'];
        }
        if (!empty($filters['search'])) {
            $clauses[] = 'e.description LIKE ?';
            $params[]  = '%' . $filters['search'] . '%';
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }

    /**
     * @return array{
     *   category_id: ?int, amount: string, description: ?string,
     *   payment_method: string, expense_date: string
     * }
     */
    private static function validate(
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $expenseDate
    ): array {
        $amountF = is_string($amount) ? (float) str_replace(',', '.', $amount) : (float) $amount;
        if ($amountF < 0.01) {
            throw new InvalidArgumentException('Importo non valido (minimo 0.01).');
        }
        if ($amountF > 99999999.99) {
            throw new InvalidArgumentException('Importo troppo grande.');
        }

        if (!in_array($paymentMethod, self::PAYMENT_METHODS, true)) {
            throw new InvalidArgumentException(
                'Metodo di pagamento non valido (ammessi: ' . implode(', ', self::PAYMENT_METHODS) . ').'
            );
        }

        if (!self::isValidDate($expenseDate)) {
            throw new InvalidArgumentException('Data non valida (formato richiesto: YYYY-MM-DD).');
        }

        $description = $description === null ? null : trim($description);
        if ($description === '') {
            $description = null;
        }
        if ($description !== null && mb_strlen($description) > 255) {
            throw new InvalidArgumentException('Descrizione troppo lunga (max 255 caratteri).');
        }

        if ($categoryId !== null) {
            if ($categoryId <= 0) {
                $categoryId = null;
            } else {
                $check = Database::pdo()->prepare(
                    'SELECT 1 FROM categories WHERE id = ? AND user_id = ? LIMIT 1'
                );
                $check->execute([$categoryId, $userId]);
                if ($check->fetchColumn() === false) {
                    throw new InvalidArgumentException('Categoria non trovata.');
                }
            }
        }

        return [
            'category_id'    => $categoryId,
            'amount'         => number_format($amountF, 2, '.', ''),
            'description'    => $description,
            'payment_method' => $paymentMethod,
            'expense_date'   => $expenseDate,
        ];
    }

    private static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }
}
