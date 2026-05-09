<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\PacContribution;
use PDOException;

/**
 * Repository per le contribuzioni PAC. Idempotenza garantita dalla
 * UNIQUE(plan_id, contribution_date): createIdempotent() ritorna null se
 * la contribuzione e' gia' presente per la stessa data, evitando duplicati
 * tra auto-generation e bank import.
 */
final class PacContributionRepository extends BaseRepository
{
    protected string $table = 'pac_contributions';

    /** @var class-string<PacContribution> */
    protected string $entityClass = PacContribution::class;

    /**
     * @param array{ plan_id?: ?int, date_from?: ?string, date_to?: ?string,
     *               limit?: int, offset?: int } $filters
     * @return list<PacContribution>
     */
    public function listForUser(int $userId, array $filters = []): array
    {
        $clauses = ['c.user_id = ?'];
        $params  = [$userId];
        if (!empty($filters['plan_id'])) {
            $clauses[] = 'c.plan_id = ?';
            $params[]  = (int) $filters['plan_id'];
        }
        if (!empty($filters['date_from'])) {
            $clauses[] = 'c.contribution_date >= ?';
            $params[]  = (string) $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $clauses[] = 'c.contribution_date <= ?';
            $params[]  = (string) $filters['date_to'];
        }
        $where  = 'WHERE ' . implode(' AND ', $clauses);
        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $rows = $this->fetchAll(
            "SELECT c.id, c.user_id, c.plan_id, c.contribution_date, c.amount,
                    c.nav, c.units, c.transfer_id, c.source, c.notes, c.created_at,
                    p.name AS plan_name,
                    f.id   AS fund_id,
                    f.name AS fund_name
             FROM pac_contributions c
             INNER JOIN pac_plans p ON p.id = c.plan_id
             INNER JOIN pac_funds f ON f.id = p.fund_id
             {$where}
             ORDER BY c.contribution_date DESC, c.id DESC
             LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return array_map(static fn(array $r): PacContribution => PacContribution::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?PacContribution
    {
        $row = $this->fetchOne(
            "SELECT c.id, c.user_id, c.plan_id, c.contribution_date, c.amount,
                    c.nav, c.units, c.transfer_id, c.source, c.notes, c.created_at,
                    p.name AS plan_name, f.id AS fund_id, f.name AS fund_name
             FROM pac_contributions c
             INNER JOIN pac_plans p ON p.id = c.plan_id
             INNER JOIN pac_funds f ON f.id = p.fund_id
             WHERE c.id = ? AND c.user_id = ? LIMIT 1",
            [$id, $userId],
        );
        return $row !== null ? PacContribution::fromRow($row) : null;
    }

    /**
     * @param array<string, mixed> $data
     * @return int|null  null se la UNIQUE(plan_id, contribution_date) era gia' presente.
     */
    public function createIdempotent(array $data): ?int
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

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        return $this->insert($data);
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }

    /**
     * Sommario aggregato per piano.
     *
     * @return array{count:int, total_amount:float, total_units:float}
     */
    public function summaryForPlan(int $planId): array
    {
        $row = $this->fetchOne(
            'SELECT COUNT(*) AS cnt,
                    COALESCE(SUM(amount), 0) AS total_amount,
                    COALESCE(SUM(units), 0)  AS total_units
             FROM pac_contributions
             WHERE plan_id = ?',
            [$planId],
        );
        return [
            'count'        => (int) ($row['cnt'] ?? 0),
            'total_amount' => (float) ($row['total_amount'] ?? 0),
            'total_units'  => (float) ($row['total_units']  ?? 0),
        ];
    }
}
