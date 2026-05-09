<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity SecurityPrice. Quotazione storica di uno strumento. UNIQUE su
 * (instrument_id, price_date). Source 'manual' (default) o 'external'
 * (quando un provider esterno tipo Yahoo/FMP popolera' i dati in futuro).
 */
final class SecurityPrice extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly int $instrumentId,
        public readonly string $priceDate,
        public readonly float $price,
        public readonly string $source,
        public readonly ?string $createdAt = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:           (int) $row['id'],
            instrumentId: (int) $row['instrument_id'],
            priceDate:    (string) $row['price_date'],
            price:        (float) $row['price'],
            source:       (string) ($row['source'] ?? 'manual'),
            createdAt:    isset($row['created_at']) ? (string) $row['created_at'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'            => $this->id,
            'instrument_id' => $this->instrumentId,
            'price_date'    => $this->priceDate,
            'price'         => number_format($this->price, 6, '.', ''),
            'source'        => $this->source,
            'created_at'    => $this->createdAt,
        ];
    }
}
