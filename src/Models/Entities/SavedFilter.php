<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity SavedFilter. Mappa una row di `saved_filters`. Il payload e' decoded
 * da JSON. UNIQUE su (user_id, scope, name).
 */
final class SavedFilter extends BaseEntity
{
    /**
     * @param array<string,mixed> $payload
     */
    public function __construct(
        public readonly int $id,
        public readonly string $scope,
        public readonly string $name,
        public readonly array $payload,
        public readonly ?string $createdAt = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        $payload = $row['payload'] ?? [];
        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            $payload = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($payload)) {
            $payload = [];
        }
        return new self(
            id:        (int) $row['id'],
            scope:     (string) $row['scope'],
            name:      (string) $row['name'],
            payload:   $payload,
            createdAt: isset($row['created_at']) ? (string) $row['created_at'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'         => $this->id,
            'scope'      => $this->scope,
            'name'       => $this->name,
            'payload'    => $this->payload,
            'created_at' => $this->createdAt,
        ];
    }
}
