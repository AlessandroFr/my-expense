<?php
declare(strict_types=1);

namespace App;

use DateTime;
use InvalidArgumentException;

final class Income
{
    /**
     * @param array{
     *   date_from?: ?string, date_to?: ?string,
     *   source?: ?string, search?: ?string,
     *   limit?: int, offset?: int
     * } $filters
     * @return array<int, array<string,mixed>>
     */
    public static function listForUser(int $userId, array $filters = []): array
    {
        [$where, $params] = self::buildWhere($userId, $filters);

        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $sql = "SELECT id, user_id, source, description, amount, income_date,
                       created_at, updated_at
                FROM incomes
                {$where}
                ORDER BY income_date DESC, id DESC
                LIMIT {$limit} OFFSET {$offset}";

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, source, description, amount, income_date, created_at, updated_at
             FROM incomes WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function create(
        int $userId,
        string $source,
        ?string $description,
        string|float $amount,
        string $incomeDate
    ): int {
        $row = self::validate($source, $description, $amount, $incomeDate);

        $stmt = Database::pdo()->prepare(
            'INSERT INTO incomes (user_id, source, description, amount, income_date)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId, $row['source'], $row['description'], $row['amount'], $row['income_date'],
        ]);
        return (int) Database::pdo()->lastInsertId();
    }

    public static function update(
        int $id,
        int $userId,
        string $source,
        ?string $description,
        string|float $amount,
        string $incomeDate
    ): void {
        $row = self::validate($source, $description, $amount, $incomeDate);

        $stmt = Database::pdo()->prepare(
            'UPDATE incomes
             SET source = ?, description = ?, amount = ?, income_date = ?
             WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([
            $row['source'], $row['description'], $row['amount'], $row['income_date'],
            $id, $userId,
        ]);
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare('DELETE FROM incomes WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
    }

    public static function monthlyTotal(int $userId, ?string $yearMonth = null): float
    {
        $ym    = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(amount), 0) FROM incomes
             WHERE user_id = ? AND income_date >= ? AND income_date < ?'
        );
        $stmt->execute([$userId, $start, $end]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * @return array<int, array{month:string, total:float}>
     */
    public static function totalsByMonth(int $userId, int $monthsBack = 6): array
    {
        $monthsBack = max(1, min(36, $monthsBack));
        $stmt = Database::pdo()->prepare(
            "SELECT DATE_FORMAT(income_date, '%Y-%m') AS month,
                    SUM(amount) AS total
             FROM incomes
             WHERE user_id = ?
               AND income_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
             GROUP BY month
             ORDER BY month ASC"
        );
        $stmt->execute([$userId, $monthsBack - 1]);
        return array_map(static function (array $r): array {
            return ['month' => (string) $r['month'], 'total' => (float) $r['total']];
        }, $stmt->fetchAll());
    }

    /** @return array<int, string> */
    public static function distinctSources(int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT DISTINCT source FROM incomes WHERE user_id = ? ORDER BY source ASC'
        );
        $stmt->execute([$userId]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    /**
     * @return array{0: string, 1: array<int|string, mixed>}
     */
    private static function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['user_id = ?'];
        $params  = [$userId];

        if (!empty($filters['date_from']) && self::isValidDate((string) $filters['date_from'])) {
            $clauses[] = 'income_date >= ?';
            $params[]  = $filters['date_from'];
        }
        if (!empty($filters['date_to']) && self::isValidDate((string) $filters['date_to'])) {
            $clauses[] = 'income_date <= ?';
            $params[]  = $filters['date_to'];
        }
        if (!empty($filters['source'])) {
            $clauses[] = 'source = ?';
            $params[]  = (string) $filters['source'];
        }
        if (!empty($filters['search'])) {
            $clauses[] = '(description LIKE ? OR source LIKE ?)';
            $params[]  = '%' . $filters['search'] . '%';
            $params[]  = '%' . $filters['search'] . '%';
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }

    /**
     * @return array{source:string, description:?string, amount:string, income_date:string}
     */
    private static function validate(
        string $source,
        ?string $description,
        string|float $amount,
        string $incomeDate
    ): array {
        $source = trim($source);
        if ($source === '' || mb_strlen($source) > 64) {
            throw new InvalidArgumentException('Origine entrata obbligatoria (max 64 caratteri).');
        }

        $amountF = is_string($amount) ? (float) str_replace(',', '.', $amount) : (float) $amount;
        if ($amountF < 0.01) {
            throw new InvalidArgumentException('Importo non valido (minimo 0.01).');
        }
        if ($amountF > 99999999.99) {
            throw new InvalidArgumentException('Importo troppo grande.');
        }

        if (!self::isValidDate($incomeDate)) {
            throw new InvalidArgumentException('Data non valida (formato YYYY-MM-DD).');
        }

        $description = $description === null ? null : trim($description);
        if ($description === '') $description = null;
        if ($description !== null && mb_strlen($description) > 255) {
            throw new InvalidArgumentException('Descrizione troppo lunga (max 255 caratteri).');
        }

        return [
            'source'      => $source,
            'description' => $description,
            'amount'      => number_format($amountF, 2, '.', ''),
            'income_date' => $incomeDate,
        ];
    }

    private static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }
}
