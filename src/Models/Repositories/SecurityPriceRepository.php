<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\SecurityPrice;

/**
 * Repository per lo storico quotazioni (securities_prices).
 *
 * upsert() usa ON DUPLICATE KEY UPDATE su UNIQUE(instrument_id, price_date)
 * per non duplicare la stessa data.
 */
final class SecurityPriceRepository extends BaseRepository
{
    protected string $table = 'securities_prices';

    /** @var class-string<SecurityPrice> */
    protected string $entityClass = SecurityPrice::class;

    /** @return list<SecurityPrice> */
    public function forInstrument(int $instrumentId, int $limit = 365): array
    {
        $limit = max(1, min(3650, $limit));
        $rows = $this->fetchAll(
            "SELECT id, instrument_id, price_date, price, source, created_at
             FROM securities_prices
             WHERE instrument_id = ?
             ORDER BY price_date DESC
             LIMIT {$limit}",
            [$instrumentId],
        );
        return array_map(static fn(array $r): SecurityPrice => SecurityPrice::fromRow($r), $rows);
    }

    public function upsert(int $instrumentId, string $priceDate, string $price, string $source = 'manual'): void
    {
        $this->exec(
            'INSERT INTO securities_prices (instrument_id, price_date, price, source)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price), source = VALUES(source)',
            [$instrumentId, $priceDate, $price, $source],
        );
    }

    public function priceOnOrBefore(int $instrumentId, string $date): ?float
    {
        $val = $this->fetchScalar(
            'SELECT price FROM securities_prices
             WHERE instrument_id = ? AND price_date <= ?
             ORDER BY price_date DESC LIMIT 1',
            [$instrumentId, $date],
        );
        return $val === false || $val === null ? null : (float) $val;
    }

    public function deleteById(int $id, int $instrumentId): int
    {
        return $this->delete($id, ['instrument_id' => $instrumentId]);
    }
}
