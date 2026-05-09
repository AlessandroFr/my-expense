<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity PacFund. Catalogo fondi/ETF per i Piani di Accumulo Capitale.
 */
final class PacFund extends BaseEntity
{
    public const TYPES = ['etf', 'mutual', 'index', 'other'];

    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly ?int $assetClassId,
        public readonly string $name,
        public readonly ?string $isin,
        public readonly string $fundType,
        public readonly string $currency,
        public readonly ?string $notes,
        public readonly bool $archived,
        public readonly ?string $createdAt = null,
        public readonly ?string $updatedAt = null,
        public readonly ?string $assetClassName = null,
        public readonly ?string $assetClassColor = null,
        public readonly ?float $lastNav = null,
        public readonly ?string $lastNavDate = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:               (int) $row['id'],
            userId:           (int) $row['user_id'],
            assetClassId:     isset($row['asset_class_id']) && $row['asset_class_id'] !== null ? (int) $row['asset_class_id'] : null,
            name:             (string) $row['name'],
            isin:             isset($row['isin']) && $row['isin'] !== null ? (string) $row['isin'] : null,
            fundType:         (string) ($row['fund_type'] ?? 'etf'),
            currency:         (string) ($row['currency']  ?? 'EUR'),
            notes:            isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            archived:         (bool) ($row['archived'] ?? 0),
            createdAt:        isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:        isset($row['updated_at']) ? (string) $row['updated_at'] : null,
            assetClassName:   isset($row['asset_class_name'])  ? (string) $row['asset_class_name']  : null,
            assetClassColor:  isset($row['asset_class_color']) ? (string) $row['asset_class_color'] : null,
            lastNav:          isset($row['last_nav'])      && $row['last_nav']      !== null ? (float)  $row['last_nav']      : null,
            lastNavDate:      isset($row['last_nav_date']) && $row['last_nav_date'] !== null ? (string) $row['last_nav_date'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'                => $this->id,
            'user_id'           => $this->userId,
            'asset_class_id'    => $this->assetClassId,
            'name'              => $this->name,
            'isin'              => $this->isin,
            'fund_type'         => $this->fundType,
            'currency'          => $this->currency,
            'notes'             => $this->notes,
            'archived'          => $this->archived ? 1 : 0,
            'created_at'        => $this->createdAt,
            'updated_at'        => $this->updatedAt,
            'asset_class_name'  => $this->assetClassName,
            'asset_class_color' => $this->assetClassColor,
            'last_nav'          => $this->lastNav !== null ? number_format($this->lastNav, 6, '.', '') : null,
            'last_nav_date'     => $this->lastNavDate,
        ];
    }
}
