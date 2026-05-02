<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDOException;
use RuntimeException;

final class Tag
{
    /** @return array<int, array<string,mixed>> */
    public static function allForUser(int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.id, t.name, t.color, t.created_at,
                    (SELECT COUNT(*) FROM expense_tags et WHERE et.tag_id = t.id) AS uses
             FROM tags t
             WHERE t.user_id = ?
             ORDER BY t.name ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findByName(int $userId, string $name): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, color FROM tags WHERE user_id = ? AND name = ? LIMIT 1'
        );
        $stmt->execute([$userId, $name]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function create(int $userId, string $name, string $color = '#6c757d'): int
    {
        [$name, $color] = self::validate($name, $color);
        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)'
            );
            $stmt->execute([$userId, $name, $color]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un tag '{$name}'.");
            }
            throw $e;
        }
        return (int) Database::pdo()->lastInsertId();
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare('DELETE FROM tags WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
    }

    /** @return array<int, string> */
    public static function namesForExpense(int $expenseId, int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.name
             FROM tags t
             INNER JOIN expense_tags et ON et.tag_id = t.id
             INNER JOIN expenses    e  ON e.id      = et.expense_id
             WHERE et.expense_id = ? AND e.user_id = ? AND t.user_id = ?
             ORDER BY t.name ASC'
        );
        $stmt->execute([$expenseId, $userId, $userId]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    /** @return array<int, array<string,mixed>> */
    public static function withColorsForExpense(int $expenseId, int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.id, t.name, t.color
             FROM tags t
             INNER JOIN expense_tags et ON et.tag_id = t.id
             INNER JOIN expenses    e  ON e.id      = et.expense_id
             WHERE et.expense_id = ? AND e.user_id = ? AND t.user_id = ?
             ORDER BY t.name ASC'
        );
        $stmt->execute([$expenseId, $userId, $userId]);
        return $stmt->fetchAll();
    }

    /**
     * Imposta i tag di una spesa (reset + insert). I nomi mancanti sono creati al volo.
     * @param array<int, string> $names
     */
    public static function setForExpense(int $expenseId, int $userId, array $names): void
    {
        $check = Database::pdo()->prepare('SELECT 1 FROM expenses WHERE id = ? AND user_id = ?');
        $check->execute([$expenseId, $userId]);
        if ($check->fetchColumn() === false) {
            throw new InvalidArgumentException('Spesa non trovata.');
        }

        $clean = [];
        foreach ($names as $n) {
            $n = trim((string) $n);
            if ($n === '' || mb_strlen($n) > 48) continue;
            $clean[mb_strtolower($n)] = $n;
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $del = $pdo->prepare('DELETE FROM expense_tags WHERE expense_id = ?');
            $del->execute([$expenseId]);

            if (!empty($clean)) {
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
            $pdo->rollBack();
            throw $e;
        }
    }

    /** @return array{0:string, 1:string} */
    private static function validate(string $name, string $color): array
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 48) {
            throw new InvalidArgumentException('Nome tag obbligatorio (max 48 caratteri).');
        }
        $color = trim($color);
        if ($color === '') $color = '#6c757d';
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw new InvalidArgumentException('Colore non valido.');
        }
        return [$name, strtolower($color)];
    }
}
