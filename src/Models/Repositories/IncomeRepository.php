<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\Income;
use DateTime;
use PDOException;

/**
 * Repository per le entrate. Sostituisce src/class/Income.php.
 */
final class IncomeRepository extends BaseRepository
{
    protected string $table = 'incomes';

    /** @var class-string<Income> */
    protected string $entityClass = Income::class;

    /**
     * @param array<string,mixed> $filters
     * @return list<Income>
     */
    public function list(int $userId, array $filters = []): array
    {
        [$where, $params] = $this->buildWhere($userId, $filters);
        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $rows = $this->fetchAll(
            "SELECT i.id, i.user_id, i.contact_id, i.account_id, i.source, i.description, i.amount,
                    i.income_date, i.value_date, i.import_hash, i.created_at, i.updated_at,
                    a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
                    co.name  AS contact_name,
                    co.color AS contact_color,
                    co.type  AS contact_type
             FROM incomes i
             LEFT JOIN accounts a  ON a.id  = i.account_id
             LEFT JOIN contacts co ON co.id = i.contact_id
             {$where}
             ORDER BY i.income_date DESC, i.id DESC
             LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return array_map(static fn(array $r): Income => Income::fromRow($r), $rows);
    }

    /** @param array<string,mixed> $filters */
    public function count(int $userId, array $filters = []): int
    {
        [$where, $params] = $this->buildWhere($userId, $filters);
        return (int) $this->fetchScalar(
            "SELECT COUNT(*) FROM incomes i
             LEFT JOIN accounts a  ON a.id  = i.account_id
             LEFT JOIN contacts co ON co.id = i.contact_id
             {$where}",
            $params,
        );
    }

    public function findById(int $id, int $userId): ?Income
    {
        $row = $this->fetchOne(
            'SELECT i.id, i.user_id, i.contact_id, i.account_id, i.source, i.description, i.amount,
                    i.income_date, i.value_date, i.import_hash, i.created_at, i.updated_at,
                    a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
                    co.name  AS contact_name,
                    co.color AS contact_color,
                    co.type  AS contact_type
             FROM incomes i
             LEFT JOIN accounts a  ON a.id  = i.account_id
             LEFT JOIN contacts co ON co.id = i.contact_id
             WHERE i.id = ? AND i.user_id = ?
             LIMIT 1',
            [$id, $userId],
        );
        return $row !== null ? Income::fromRow($row) : null;
    }

    /** @param array<string,mixed> $data */
    public function create(array $data): int
    {
        return $this->insert($data);
    }

    /** @param array<string,mixed> $data */
    public function createImported(array $data): ?int
    {
        try {
            return $this->insert($data);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000' && (int) ($e->errorInfo[1] ?? 0) === 1062) {
                return null;
            }
            throw $e;
        }
    }

    /** @param array<string,mixed> $data */
    public function updateForUser(int $id, int $userId, array $data): int
    {
        return $this->update($id, $data, ['user_id' => $userId]);
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }

    public function monthlyTotal(int $userId, ?string $yearMonth = null): float
    {
        $ym    = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', (int) strtotime($start . ' +1 month'));
        return (float) $this->fetchScalar(
            'SELECT COALESCE(SUM(amount), 0) FROM incomes
             WHERE user_id = ? AND income_date >= ? AND income_date < ?
               AND is_transfer = 0',
            [$userId, $start, $end],
        );
    }

    public function totalForRange(int $userId, string $from, string $to): float
    {
        return (float) $this->fetchScalar(
            'SELECT COALESCE(SUM(amount), 0) FROM incomes
             WHERE user_id = ? AND income_date >= ? AND income_date <= ?
               AND is_transfer = 0',
            [$userId, $from, $to],
        );
    }

    /** @return list<array{month:string,total:float}> */
    public function totalsByMonth(int $userId, int $monthsBack = 6): array
    {
        $monthsBack = max(1, min(36, $monthsBack));
        // Vedi ExpenseRepository::totalsByMonth: la data di partenza si calcola
        // qui perche' SQLite non accetta un placeholder dentro date().
        $from = date('Y-m-01', (int) strtotime('-' . ($monthsBack - 1) . ' months', (int) strtotime(date('Y-m-01'))));
        $rows = $this->fetchAll(
            "SELECT strftime('%Y-%m', i.income_date) AS month,
                    ROUND(SUM(i.amount), 2) AS total
             FROM incomes i
             WHERE i.user_id = ?
               AND i.income_date >= ?
               AND i.is_transfer = 0
             GROUP BY month
             ORDER BY month ASC",
            [$userId, $from],
        );
        return array_map(
            static fn(array $r): array => ['month' => (string) $r['month'], 'total' => (float) $r['total']],
            $rows,
        );
    }

    /** @return list<string> */
    public function distinctSources(int $userId): array
    {
        $rows = $this->fetchAll('SELECT DISTINCT source FROM incomes WHERE user_id = ? ORDER BY source ASC', [$userId]);
        return array_map(static fn(array $r): string => (string) $r['source'], $rows);
    }

    public static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }

    /** @return array{0:string, 1:list<int|string|float>} */
    private function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['i.user_id = ?', 'i.is_transfer = 0'];
        $params  = [$userId];

        if (!empty($filters['date_from']) && self::isValidDate((string) $filters['date_from'])) {
            $clauses[] = 'i.income_date >= ?';
            $params[]  = $filters['date_from'];
        }
        if (!empty($filters['date_to']) && self::isValidDate((string) $filters['date_to'])) {
            $clauses[] = 'i.income_date <= ?';
            $params[]  = $filters['date_to'];
        }
        if (!empty($filters['source'])) {
            $clauses[] = 'i.source = ?';
            $params[]  = (string) $filters['source'];
        }
        if (!empty($filters['account_id'])) {
            $clauses[] = 'i.account_id = ?';
            $params[]  = (int) $filters['account_id'];
        }
        if (!empty($filters['contact_id'])) {
            $clauses[] = 'i.contact_id = ?';
            $params[]  = (int) $filters['contact_id'];
        }
        if (!empty($filters['search'])) {
            $clauses[] = '(i.description LIKE ? OR i.source LIKE ?)';
            $params[]  = '%' . $filters['search'] . '%';
            $params[]  = '%' . $filters['search'] . '%';
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }
}
