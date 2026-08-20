<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\SavedFilter;

/**
 * Repository per i filtri salvati. Sostituisce src/class/SavedFilter.php.
 */
final class SavedFilterRepository extends BaseRepository
{
    protected string $table = 'saved_filters';

    /** @var class-string<SavedFilter> */
    protected string $entityClass = SavedFilter::class;

    /**
     * @return list<SavedFilter>
     */
    public function listForUser(int $userId, string $scope = 'expenses'): array
    {
        $rows = $this->fetchAll(
            'SELECT id, scope, name, payload, created_at
             FROM saved_filters
             WHERE user_id = ? AND scope = ?
             ORDER BY name ASC',
            [$userId, $scope],
        );
        return array_map(static fn(array $r): SavedFilter => SavedFilter::fromRow($r), $rows);
    }

    public function save(int $userId, string $scope, string $name, string $payloadJson): int
    {
        $this->exec(
            'INSERT INTO saved_filters (user_id, scope, name, payload)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, scope, name) DO UPDATE SET payload = excluded.payload',
            [$userId, $scope, $name, $payloadJson],
        );
        return (int) $this->pdo()->lastInsertId();
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }
}
