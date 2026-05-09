<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\Expense;
use DateTime;
use PDOException;

/**
 * Repository per le spese. Sostituisce le query statiche di src/class/Expense.php.
 *
 * Le query mantengono lo stesso shape di output atteso dal JS frontend: i campi
 * join (category_name, account_name, contact_name, ecc.) sono inclusi via LEFT JOIN
 * e i tag fetched in batch.
 */
final class ExpenseRepository extends BaseRepository
{
    protected string $table = 'expenses';

    /** @var class-string<Expense> */
    protected string $entityClass = Expense::class;

    /**
     * @param array{
     *   date_from?: ?string, date_to?: ?string,
     *   category_id?: ?int, account_id?: ?int, contact_id?: ?int,
     *   amount_min?: ?float, amount_max?: ?float,
     *   search?: ?string, tag?: ?string,
     *   limit?: int, offset?: int
     * } $filters
     * @return list<Expense>
     */
    public function list(int $userId, array $filters = []): array
    {
        [$where, $params] = $this->buildWhere($userId, $filters);
        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $sql = "SELECT e.id, e.user_id, e.category_id, e.contact_id, e.account_id, e.amount, e.description,
                       e.shared_with, e.share_amount,
                       e.payment_method, e.expense_date, e.value_date, e.import_hash, e.created_at, e.updated_at,
                       c.name  AS category_name,
                       c.color AS category_color,
                       c.icon  AS category_icon,
                       a.name  AS account_name,
                       a.color AS account_color,
                       a.icon  AS account_icon,
                       co.name  AS contact_name,
                       co.color AS contact_color,
                       co.type  AS contact_type
                FROM expenses e
                LEFT JOIN categories c  ON c.id  = e.category_id
                LEFT JOIN accounts   a  ON a.id  = e.account_id
                LEFT JOIN contacts   co ON co.id = e.contact_id
                {$where}
                ORDER BY e.expense_date DESC, e.id DESC
                LIMIT {$limit} OFFSET {$offset}";

        $rows = $this->fetchAll($sql, $params);
        if ($rows === []) {
            return [];
        }

        $ids   = array_map(static fn(array $r): int => (int) $r['id'], $rows);
        $tagsByExpense = $this->tagsForExpenses($ids, $userId);
        foreach ($rows as &$r) {
            $r['tags'] = $tagsByExpense[(int) $r['id']] ?? [];
        }
        unset($r);

        return array_map(static fn(array $r): Expense => Expense::fromRow($r), $rows);
    }

    /**
     * @param array<string, mixed> $filters
     */
    public function count(int $userId, array $filters = []): int
    {
        [$where, $params] = $this->buildWhere($userId, $filters);
        $sql = "SELECT COUNT(*) FROM expenses e
                LEFT JOIN categories c  ON c.id  = e.category_id
                LEFT JOIN accounts   a  ON a.id  = e.account_id
                LEFT JOIN contacts   co ON co.id = e.contact_id
                {$where}";
        return (int) $this->fetchScalar($sql, $params);
    }

    public function findById(int $id, int $userId): ?Expense
    {
        $row = $this->fetchOne(
            'SELECT e.id, e.user_id, e.category_id, e.contact_id, e.account_id, e.amount, e.description,
                    e.shared_with, e.share_amount,
                    e.payment_method, e.expense_date, e.value_date, e.import_hash, e.created_at, e.updated_at,
                    c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                    a.name AS account_name,  a.color AS account_color,  a.icon AS account_icon,
                    co.name  AS contact_name,
                    co.color AS contact_color,
                    co.type  AS contact_type
             FROM expenses e
             LEFT JOIN categories c  ON c.id  = e.category_id
             LEFT JOIN accounts   a  ON a.id  = e.account_id
             LEFT JOIN contacts   co ON co.id = e.contact_id
             WHERE e.id = ? AND e.user_id = ?
             LIMIT 1',
            [$id, $userId],
        );
        if ($row === null) {
            return null;
        }
        $tagsByExpense = $this->tagsForExpenses([$id], $userId);
        $row['tags'] = $tagsByExpense[$id] ?? [];
        return Expense::fromRow($row);
    }

    /**
     * Insert generico per create. Restituisce il lastInsertId.
     * @param array<string, mixed> $data
     */
    public function create(array $data): int
    {
        return $this->insert($data);
    }

    /**
     * Insert con value_date + import_hash (bank import). Restituisce null se la
     * UNIQUE su (user_id, import_hash) e' violata (riga gia' importata).
     *
     * @param array<string, mixed> $data
     */
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

    /**
     * @param array<string, mixed> $data
     */
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
            'SELECT COALESCE(SUM(amount), 0)
             FROM expenses
             WHERE user_id = ? AND expense_date >= ? AND expense_date < ?
               AND is_transfer = 0',
            [$userId, $start, $end],
        );
    }

    /**
     * @return list<array{category_id: ?int, name: string, color: string, icon: ?string, total: float}>
     */
    public function totalsByCategoryForMonth(int $userId, ?string $yearMonth = null): array
    {
        $ym    = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', (int) strtotime($start . ' +1 month'));
        return $this->totalsByCategoryRange($userId, $start, $end, exclusiveEnd: true);
    }

    public function totalForRange(int $userId, string $from, string $to): float
    {
        return (float) $this->fetchScalar(
            'SELECT COALESCE(SUM(amount), 0)
             FROM expenses
             WHERE user_id = ? AND expense_date >= ? AND expense_date <= ?
               AND is_transfer = 0',
            [$userId, $from, $to],
        );
    }

    /**
     * @return list<array{category_id: ?int, name: string, color: string, icon: ?string, total: float}>
     */
    public function totalsByCategoryForRange(int $userId, string $from, string $to): array
    {
        return $this->totalsByCategoryRange($userId, $from, $to, exclusiveEnd: false);
    }

    /**
     * @return list<array{month: string, total: float}>
     */
    public function totalsByMonth(int $userId, int $monthsBack = 6): array
    {
        $monthsBack = max(1, min(36, $monthsBack));
        $rows = $this->fetchAll(
            "SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month,
                    SUM(amount) AS total
             FROM expenses
             WHERE user_id = ?
               AND expense_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
               AND is_transfer = 0
             GROUP BY month
             ORDER BY month ASC",
            [$userId, $monthsBack - 1],
        );
        return array_map(
            static fn(array $r): array => ['month' => (string) $r['month'], 'total' => (float) $r['total']],
            $rows,
        );
    }

    /**
     * @return list<array{category_id: ?int, name: string, color: string, icon: ?string, total: float}>
     */
    private function totalsByCategoryRange(int $userId, string $from, string $to, bool $exclusiveEnd): array
    {
        $cmp = $exclusiveEnd ? '<' : '<=';
        $rows = $this->fetchAll(
            "SELECT
                e.category_id,
                COALESCE(c.name, 'Senza categoria') AS name,
                COALESCE(c.color, '#6c757d')         AS color,
                c.icon                                AS icon,
                SUM(e.amount)                         AS total
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date {$cmp} ?
               AND e.is_transfer = 0
             GROUP BY e.category_id, c.name, c.color, c.icon
             ORDER BY total DESC",
            [$userId, $from, $to],
        );
        return array_map(
            static fn(array $r): array => [
                'category_id' => $r['category_id'] === null ? null : (int) $r['category_id'],
                'name'        => (string) $r['name'],
                'color'       => (string) $r['color'],
                'icon'        => $r['icon'] !== null ? (string) $r['icon'] : null,
                'total'       => (float) $r['total'],
            ],
            $rows,
        );
    }

    public static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }

    /**
     * @param list<int> $expenseIds
     * @return array<int, list<array{id:int,name:string,color:string}>>
     */
    private function tagsForExpenses(array $expenseIds, int $userId): array
    {
        if ($expenseIds === []) {
            return [];
        }
        $in = implode(',', array_fill(0, count($expenseIds), '?'));
        $rows = $this->fetchAll(
            "SELECT et.expense_id, t.id, t.name, t.color
             FROM expense_tags et
             INNER JOIN tags t ON t.id = et.tag_id
             WHERE et.expense_id IN ({$in}) AND t.user_id = ?
             ORDER BY t.name ASC",
            [...$expenseIds, $userId],
        );
        $byExp = [];
        foreach ($rows as $r) {
            $byExp[(int) $r['expense_id']][] = [
                'id'    => (int) $r['id'],
                'name'  => (string) $r['name'],
                'color' => (string) $r['color'],
            ];
        }
        return $byExp;
    }

    /**
     * @return array{0: string, 1: list<int|string|float>}
     */
    private function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['e.user_id = ?', 'e.is_transfer = 0'];
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
        if (!empty($filters['account_id'])) {
            $clauses[] = 'e.account_id = ?';
            $params[]  = (int) $filters['account_id'];
        }
        if (!empty($filters['contact_id'])) {
            $clauses[] = 'e.contact_id = ?';
            $params[]  = (int) $filters['contact_id'];
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
        if (!empty($filters['tag'])) {
            $clauses[] = 'EXISTS (
                SELECT 1 FROM expense_tags et2
                INNER JOIN tags t2 ON t2.id = et2.tag_id
                WHERE et2.expense_id = e.id AND t2.user_id = e.user_id AND t2.name = ?
            )';
            $params[]  = (string) $filters['tag'];
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }
}
