<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\AssetClass;

/**
 * Repository per le asset class user-scoped (Azionario / Obbligazionario / ...).
 */
final class AssetClassRepository extends BaseRepository
{
    protected string $table = 'asset_classes';

    /** @var class-string<AssetClass> */
    protected string $entityClass = AssetClass::class;

    /** @return list<AssetClass> */
    public function allForUser(int $userId): array
    {
        $rows = $this->fetchAll(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM asset_classes
             WHERE user_id = ?
             ORDER BY sort_order ASC, name ASC',
            [$userId],
        );
        return array_map(static fn(array $r): AssetClass => AssetClass::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?AssetClass
    {
        $row = $this->fetchOne(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM asset_classes
             WHERE id = ? AND user_id = ? LIMIT 1',
            [$id, $userId],
        );
        return $row !== null ? AssetClass::fromRow($row) : null;
    }

    public function findByName(int $userId, string $name): ?AssetClass
    {
        $row = $this->fetchOne(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM asset_classes
             WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
            [$userId, $name],
        );
        return $row !== null ? AssetClass::fromRow($row) : null;
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
}
