<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity AssetClass. Tassonomia user-scoped per classificare strumenti
 * (Azionario / Obbligazionario / Monetario / Multi-asset / Immobiliare).
 */
final class AssetClass extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly string $name,
        public readonly string $color,
        public readonly ?string $icon,
        public readonly int $sortOrder,
        public readonly ?string $createdAt = null,
        public readonly ?string $updatedAt = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:        (int) $row['id'],
            userId:    (int) $row['user_id'],
            name:      (string) $row['name'],
            color:     (string) ($row['color'] ?? '#6c757d'),
            icon:      isset($row['icon']) && $row['icon'] !== null ? (string) $row['icon'] : null,
            sortOrder: (int) ($row['sort_order'] ?? 0),
            createdAt: isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt: isset($row['updated_at']) ? (string) $row['updated_at'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'         => $this->id,
            'user_id'    => $this->userId,
            'name'       => $this->name,
            'color'      => $this->color,
            'icon'       => $this->icon,
            'sort_order' => $this->sortOrder,
            'created_at' => $this->createdAt,
            'updated_at' => $this->updatedAt,
        ];
    }
}
