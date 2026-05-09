<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity SecurityInstrument. Mappa una row di `securities_instruments` con
 * join opzionali su asset_classes (name/color/icon) e accounts (name).
 */
final class SecurityInstrument extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly ?int $accountId,
        public readonly ?int $assetClassId,
        public readonly ?string $isin,
        public readonly ?string $ticker,
        public readonly string $name,
        public readonly string $currency,
        public readonly ?string $notes,
        public readonly bool $archived,
        public readonly ?string $createdAt = null,
        public readonly ?string $updatedAt = null,
        public readonly ?string $assetClassName = null,
        public readonly ?string $assetClassColor = null,
        public readonly ?string $assetClassIcon = null,
        public readonly ?string $accountName = null,
        public readonly ?string $accountColor = null,
        public readonly ?float $lastPrice = null,
        public readonly ?string $lastPriceDate = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:               (int) $row['id'],
            userId:           (int) $row['user_id'],
            accountId:        isset($row['account_id']) && $row['account_id'] !== null ? (int) $row['account_id'] : null,
            assetClassId:     isset($row['asset_class_id']) && $row['asset_class_id'] !== null ? (int) $row['asset_class_id'] : null,
            isin:             isset($row['isin']) && $row['isin'] !== null ? (string) $row['isin'] : null,
            ticker:           isset($row['ticker']) && $row['ticker'] !== null ? (string) $row['ticker'] : null,
            name:             (string) $row['name'],
            currency:         (string) ($row['currency'] ?? 'EUR'),
            notes:            isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            archived:         (bool) ($row['archived'] ?? 0),
            createdAt:        isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:        isset($row['updated_at']) ? (string) $row['updated_at'] : null,
            assetClassName:   isset($row['asset_class_name'])  ? (string) $row['asset_class_name']  : null,
            assetClassColor:  isset($row['asset_class_color']) ? (string) $row['asset_class_color'] : null,
            assetClassIcon:   isset($row['asset_class_icon']) && $row['asset_class_icon'] !== null  ? (string) $row['asset_class_icon'] : null,
            accountName:      isset($row['account_name'])  ? (string) $row['account_name']  : null,
            accountColor:     isset($row['account_color']) ? (string) $row['account_color'] : null,
            lastPrice:        isset($row['last_price'])      && $row['last_price']      !== null ? (float)  $row['last_price']      : null,
            lastPriceDate:    isset($row['last_price_date']) && $row['last_price_date'] !== null ? (string) $row['last_price_date'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'                => $this->id,
            'user_id'           => $this->userId,
            'account_id'        => $this->accountId,
            'asset_class_id'    => $this->assetClassId,
            'isin'              => $this->isin,
            'ticker'            => $this->ticker,
            'name'              => $this->name,
            'currency'          => $this->currency,
            'notes'             => $this->notes,
            'archived'          => $this->archived ? 1 : 0,
            'created_at'        => $this->createdAt,
            'updated_at'        => $this->updatedAt,
            'asset_class_name'  => $this->assetClassName,
            'asset_class_color' => $this->assetClassColor,
            'asset_class_icon'  => $this->assetClassIcon,
            'account_name'      => $this->accountName,
            'account_color'     => $this->accountColor,
            'last_price'        => $this->lastPrice !== null ? number_format($this->lastPrice, 6, '.', '') : null,
            'last_price_date'   => $this->lastPriceDate,
        ];
    }
}
