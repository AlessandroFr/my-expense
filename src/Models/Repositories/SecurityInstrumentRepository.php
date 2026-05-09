<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\SecurityInstrument;

/**
 * Repository per gli strumenti finanziari (securities_instruments).
 *
 * Le query di list() includono i join su asset_classes (name/color/icon),
 * accounts (name/color) e l'ultimo prezzo registrato (last_price/last_price_date)
 * via subquery correlata.
 */
final class SecurityInstrumentRepository extends BaseRepository
{
    protected string $table = 'securities_instruments';

    /** @var class-string<SecurityInstrument> */
    protected string $entityClass = SecurityInstrument::class;

    /**
     * @param array{ account_id?: ?int, asset_class_id?: ?int,
     *               include_archived?: bool, limit?: int, offset?: int } $filters
     * @return list<SecurityInstrument>
     */
    public function listForUser(int $userId, array $filters = []): array
    {
        [$where, $params] = $this->buildWhere($userId, $filters);
        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $rows = $this->fetchAll(
            "SELECT s.id, s.user_id, s.account_id, s.asset_class_id, s.isin, s.ticker,
                    s.name, s.currency, s.notes, s.archived, s.created_at, s.updated_at,
                    ac.name  AS asset_class_name,
                    ac.color AS asset_class_color,
                    ac.icon  AS asset_class_icon,
                    a.name   AS account_name,
                    a.color  AS account_color,
                    (SELECT p.price      FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price,
                    (SELECT p.price_date FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price_date
             FROM securities_instruments s
             LEFT JOIN asset_classes ac ON ac.id = s.asset_class_id
             LEFT JOIN accounts a       ON a.id  = s.account_id
             {$where}
             ORDER BY s.archived ASC, s.name ASC
             LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return array_map(static fn(array $r): SecurityInstrument => SecurityInstrument::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?SecurityInstrument
    {
        $row = $this->fetchOne(
            "SELECT s.id, s.user_id, s.account_id, s.asset_class_id, s.isin, s.ticker,
                    s.name, s.currency, s.notes, s.archived, s.created_at, s.updated_at,
                    ac.name AS asset_class_name, ac.color AS asset_class_color, ac.icon AS asset_class_icon,
                    a.name  AS account_name,    a.color  AS account_color,
                    (SELECT p.price      FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price,
                    (SELECT p.price_date FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price_date
             FROM securities_instruments s
             LEFT JOIN asset_classes ac ON ac.id = s.asset_class_id
             LEFT JOIN accounts a       ON a.id  = s.account_id
             WHERE s.id = ? AND s.user_id = ? LIMIT 1",
            [$id, $userId],
        );
        return $row !== null ? SecurityInstrument::fromRow($row) : null;
    }

    public function findByIsinOrTicker(int $userId, ?string $isin, ?string $ticker): ?SecurityInstrument
    {
        if (($isin ?? '') === '' && ($ticker ?? '') === '') {
            return null;
        }
        $clauses = [];
        $params  = [$userId];
        if ($isin !== null && $isin !== '') {
            $clauses[] = 's.isin = ?';
            $params[]  = $isin;
        }
        if ($ticker !== null && $ticker !== '') {
            $clauses[] = 's.ticker = ?';
            $params[]  = $ticker;
        }
        $row = $this->fetchOne(
            "SELECT s.id, s.user_id, s.account_id, s.asset_class_id, s.isin, s.ticker,
                    s.name, s.currency, s.notes, s.archived, s.created_at, s.updated_at
             FROM securities_instruments s
             WHERE s.user_id = ? AND (" . implode(' OR ', $clauses) . ')
             LIMIT 1',
            $params,
        );
        return $row !== null ? SecurityInstrument::fromRow($row) : null;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        return $this->insert($data);
    }

    /** @param array<string, mixed> $data */
    public function updateForUser(int $id, int $userId, array $data): int
    {
        return $this->update($id, $data, ['user_id' => $userId]);
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }

    /**
     * @return array{0: string, 1: list<int|string>}
     */
    private function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['s.user_id = ?'];
        $params  = [$userId];

        if (!empty($filters['account_id'])) {
            $clauses[] = 's.account_id = ?';
            $params[]  = (int) $filters['account_id'];
        }
        if (!empty($filters['asset_class_id'])) {
            $clauses[] = 's.asset_class_id = ?';
            $params[]  = (int) $filters['asset_class_id'];
        }
        if (empty($filters['include_archived'])) {
            $clauses[] = 's.archived = 0';
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }
}
