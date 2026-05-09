<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\SecurityTransaction;

/**
 * Repository per le operazioni titoli (securities_transactions).
 */
final class SecurityTransactionRepository extends BaseRepository
{
    protected string $table = 'securities_transactions';

    /** @var class-string<SecurityTransaction> */
    protected string $entityClass = SecurityTransaction::class;

    /**
     * @param array{ account_id?: ?int, instrument_id?: ?int, kind?: ?string,
     *               date_from?: ?string, date_to?: ?string,
     *               limit?: int, offset?: int } $filters
     * @return list<SecurityTransaction>
     */
    public function listForUser(int $userId, array $filters = []): array
    {
        [$where, $params] = $this->buildWhere($userId, $filters);
        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $rows = $this->fetchAll(
            "SELECT t.id, t.user_id, t.account_id, t.instrument_id, t.kind,
                    t.trade_date, t.settlement_date, t.quantity, t.price, t.fee,
                    t.gross_amount, t.net_amount, t.tax_withheld,
                    t.expense_id, t.income_id, t.notes, t.created_at, t.updated_at,
                    s.name   AS instrument_name,
                    s.ticker AS instrument_ticker,
                    s.isin   AS instrument_isin,
                    a.name   AS account_name
             FROM securities_transactions t
             INNER JOIN securities_instruments s ON s.id = t.instrument_id
             INNER JOIN accounts a               ON a.id = t.account_id
             {$where}
             ORDER BY t.trade_date DESC, t.id DESC
             LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return array_map(static fn(array $r): SecurityTransaction => SecurityTransaction::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?SecurityTransaction
    {
        $row = $this->fetchOne(
            "SELECT t.id, t.user_id, t.account_id, t.instrument_id, t.kind,
                    t.trade_date, t.settlement_date, t.quantity, t.price, t.fee,
                    t.gross_amount, t.net_amount, t.tax_withheld,
                    t.expense_id, t.income_id, t.notes, t.created_at, t.updated_at,
                    s.name AS instrument_name, s.ticker AS instrument_ticker, s.isin AS instrument_isin,
                    a.name AS account_name
             FROM securities_transactions t
             INNER JOIN securities_instruments s ON s.id = t.instrument_id
             INNER JOIN accounts a               ON a.id = t.account_id
             WHERE t.id = ? AND t.user_id = ?
             LIMIT 1",
            [$id, $userId],
        );
        return $row !== null ? SecurityTransaction::fromRow($row) : null;
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
     * @return array{0: string, 1: list<int|string>}
     */
    private function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['t.user_id = ?'];
        $params  = [$userId];

        if (!empty($filters['account_id'])) {
            $clauses[] = 't.account_id = ?';
            $params[]  = (int) $filters['account_id'];
        }
        if (!empty($filters['instrument_id'])) {
            $clauses[] = 't.instrument_id = ?';
            $params[]  = (int) $filters['instrument_id'];
        }
        if (!empty($filters['kind'])) {
            $clauses[] = 't.kind = ?';
            $params[]  = (string) $filters['kind'];
        }
        if (!empty($filters['date_from'])) {
            $clauses[] = 't.trade_date >= ?';
            $params[]  = (string) $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $clauses[] = 't.trade_date <= ?';
            $params[]  = (string) $filters['date_to'];
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }
}
