<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\Category;

/**
 * Repository per le categorie. Sostituisce le query statiche di src/class/Category.php.
 */
final class CategoryRepository extends BaseRepository
{
    protected string $table = 'categories';

    /** @var class-string<Category> */
    protected string $entityClass = Category::class;

    /**
     * @return list<Category>
     */
    public function listForUser(int $userId): array
    {
        $rows = $this->fetchAll(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM categories
             WHERE user_id = ?
             ORDER BY sort_order ASC, name ASC',
            [$userId],
        );
        return array_map(static fn(array $r): Category => Category::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?Category
    {
        $row = $this->fetchOne(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM categories
             WHERE id = ? AND user_id = ?
             LIMIT 1',
            [$id, $userId],
        );
        return $row !== null ? Category::fromRow($row) : null;
    }

    public function findByNameForUser(int $userId, string $name): ?Category
    {
        $row = $this->fetchOne(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM categories
             WHERE user_id = ? AND LOWER(name) = LOWER(?)
             LIMIT 1',
            [$userId, $name],
        );
        return $row !== null ? Category::fromRow($row) : null;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): int
    {
        return $this->insert($data);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function updateForUser(int $id, int $userId, array $data): int
    {
        return $this->update($id, $data, ['user_id' => $userId]);
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }
}
