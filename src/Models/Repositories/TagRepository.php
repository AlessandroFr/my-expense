<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\Tag;

/**
 * Repository per i tag. Sostituisce le query statiche di src/class/Tag.php.
 */
final class TagRepository extends BaseRepository
{
    protected string $table = 'tags';

    /** @var class-string<Tag> */
    protected string $entityClass = Tag::class;

    /**
     * @return list<Tag>
     */
    public function listForUser(int $userId): array
    {
        $rows = $this->fetchAll(
            'SELECT t.id, t.name, t.color, t.created_at,
                    (SELECT COUNT(*) FROM expense_tags et WHERE et.tag_id = t.id) AS uses
             FROM tags t
             WHERE t.user_id = ?
             ORDER BY t.name ASC',
            [$userId],
        );
        return array_map(static fn(array $r): Tag => Tag::fromRow($r), $rows);
    }

    public function findByName(int $userId, string $name): ?Tag
    {
        $row = $this->fetchOne(
            'SELECT id, name, color, created_at FROM tags WHERE user_id = ? AND name = ? LIMIT 1',
            [$userId, $name],
        );
        return $row !== null ? Tag::fromRow($row) : null;
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }

    /**
     * @return list<array{id:int,name:string,color:string}>
     */
    public function withColorsForExpense(int $expenseId, int $userId): array
    {
        $rows = $this->fetchAll(
            'SELECT t.id, t.name, t.color
             FROM tags t
             INNER JOIN expense_tags et ON et.tag_id = t.id
             INNER JOIN expenses    e  ON e.id      = et.expense_id
             WHERE et.expense_id = ? AND e.user_id = ? AND t.user_id = ?
             ORDER BY t.name ASC',
            [$expenseId, $userId, $userId],
        );
        return array_map(
            static fn(array $r): array => [
                'id'    => (int) $r['id'],
                'name'  => (string) $r['name'],
                'color' => (string) $r['color'],
            ],
            $rows,
        );
    }

    /**
     * Reset + insert tag di una spesa. Apre la transazione.
     *
     * @param array<int, string> $names
     */
    public function setForExpense(int $expenseId, int $userId, array $names): void
    {
        $check = $this->exec('SELECT 1 FROM expenses WHERE id = ? AND user_id = ?', [$expenseId, $userId]);
        if ($check->fetchColumn() === false) {
            throw new \InvalidArgumentException('Spesa non trovata.');
        }

        $clean = [];
        foreach ($names as $n) {
            $n = trim((string) $n);
            if ($n === '' || mb_strlen($n) > 48) {
                continue;
            }
            $clean[mb_strtolower($n)] = $n;
        }

        $pdo = $this->pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM expense_tags WHERE expense_id = ?')->execute([$expenseId]);
            if ($clean !== []) {
                $find = $pdo->prepare('SELECT id FROM tags WHERE user_id = ? AND name = ? LIMIT 1');
                $ins  = $pdo->prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)');
                $link = $pdo->prepare('INSERT IGNORE INTO expense_tags (expense_id, tag_id) VALUES (?, ?)');
                foreach ($clean as $name) {
                    $find->execute([$userId, $name]);
                    $tagId = $find->fetchColumn();
                    if ($tagId === false) {
                        $ins->execute([$userId, $name]);
                        $tagId = (int) $pdo->lastInsertId();
                    } else {
                        $tagId = (int) $tagId;
                    }
                    $link->execute([$expenseId, $tagId]);
                }
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
