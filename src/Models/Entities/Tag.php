<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity Tag. Mappa una row della tabella `tags` con il count `uses` calcolato.
 * UNIQUE su (user_id, name).
 */
final class Tag extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $color,
        public readonly int $uses = 0,
        public readonly ?string $createdAt = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:        (int) $row['id'],
            name:      (string) $row['name'],
            color:     (string) ($row['color'] ?? '#6c757d'),
            uses:      (int) ($row['uses'] ?? 0),
            createdAt: isset($row['created_at']) ? (string) $row['created_at'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'         => $this->id,
            'name'       => $this->name,
            'color'      => $this->color,
            'uses'       => $this->uses,
            'created_at' => $this->createdAt,
        ];
    }
}
