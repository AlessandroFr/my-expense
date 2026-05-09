<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\Transfer;
use DateTime;

/**
 * Repository per i trasferimenti atomici fra conti.
 *
 * La creazione di un Transfer NON e' fatta qui in unica transazione: e'
 * orchestrata dal TransferService che apre una transaction unica e usa
 * questo repo + ExpenseRepository + IncomeRepository per scrivere le 3 righe
 * coerenti (transfer + expense flagged + income flagged).
 */
final class TransferRepository extends BaseRepository
{
    protected string $table = 'transfers';

    /** @var class-string<Transfer> */
    protected string $entityClass = Transfer::class;

    /**
     * @param array{
     *   date_from?: ?string, date_to?: ?string,
     *   account_id?: ?int,
     *   limit?: int, offset?: int
     * } $filters
     * @return list<Transfer>
     */
    public function list(int $userId, array $filters = []): array
    {
        [$where, $params] = $this->buildWhere($userId, $filters);
        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $rows = $this->fetchAll(
            "SELECT t.id, t.user_id, t.source_account_id, t.destination_account_id,
                    t.amount, t.transfer_date, t.description, t.notes,
                    t.created_at, t.updated_at,
                    s.name  AS source_name,
                    s.color AS source_color,
                    s.icon  AS source_icon,
                    d.name  AS destination_name,
                    d.color AS destination_color,
                    d.icon  AS destination_icon
             FROM transfers t
             INNER JOIN accounts s ON s.id = t.source_account_id
             INNER JOIN accounts d ON d.id = t.destination_account_id
             {$where}
             ORDER BY t.transfer_date DESC, t.id DESC
             LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return array_map(static fn(array $r): Transfer => Transfer::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?Transfer
    {
        $row = $this->fetchOne(
            'SELECT t.id, t.user_id, t.source_account_id, t.destination_account_id,
                    t.amount, t.transfer_date, t.description, t.notes,
                    t.created_at, t.updated_at,
                    s.name  AS source_name,  s.color AS source_color,  s.icon  AS source_icon,
                    d.name  AS destination_name, d.color AS destination_color, d.icon AS destination_icon
             FROM transfers t
             INNER JOIN accounts s ON s.id = t.source_account_id
             INNER JOIN accounts d ON d.id = t.destination_account_id
             WHERE t.id = ? AND t.user_id = ?
             LIMIT 1',
            [$id, $userId],
        );
        return $row !== null ? Transfer::fromRow($row) : null;
    }

    /** @param array<string,mixed> $data */
    public function create(array $data): int
    {
        return $this->insert($data);
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }

    public static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }

    /**
     * @return array{0: string, 1: list<int|string|float>}
     */
    private function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['t.user_id = ?'];
        $params  = [$userId];

        if (!empty($filters['date_from']) && self::isValidDate((string) $filters['date_from'])) {
            $clauses[] = 't.transfer_date >= ?';
            $params[]  = $filters['date_from'];
        }
        if (!empty($filters['date_to']) && self::isValidDate((string) $filters['date_to'])) {
            $clauses[] = 't.transfer_date <= ?';
            $params[]  = $filters['date_to'];
        }
        if (!empty($filters['account_id'])) {
            $clauses[] = '(t.source_account_id = ? OR t.destination_account_id = ?)';
            $params[]  = (int) $filters['account_id'];
            $params[]  = (int) $filters['account_id'];
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }
}
