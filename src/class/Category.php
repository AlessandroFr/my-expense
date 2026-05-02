<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDOException;
use RuntimeException;

final class Category
{
    /** @return array<int, array<string,mixed>> */
    public static function allForUser(int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM categories
             WHERE user_id = ?
             ORDER BY sort_order ASC, name ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
             FROM categories
             WHERE id = ? AND user_id = ?
             LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function create(int $userId, string $name, string $color, ?string $icon, int $sortOrder = 0): int
    {
        [$name, $color, $icon, $sortOrder] = self::validate($name, $color, $icon, $sortOrder);

        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO categories (user_id, name, color, icon, sort_order)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$userId, $name, $color, $icon, $sortOrder]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste già una categoria con il nome '{$name}'.");
            }
            throw $e;
        }

        return (int) Database::pdo()->lastInsertId();
    }

    public static function update(int $id, int $userId, string $name, string $color, ?string $icon, int $sortOrder = 0): void
    {
        [$name, $color, $icon, $sortOrder] = self::validate($name, $color, $icon, $sortOrder);

        try {
            $stmt = Database::pdo()->prepare(
                'UPDATE categories
                 SET name = ?, color = ?, icon = ?, sort_order = ?
                 WHERE id = ? AND user_id = ?'
            );
            $stmt->execute([$name, $color, $icon, $sortOrder, $id, $userId]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste già una categoria con il nome '{$name}'.");
            }
            throw $e;
        }
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'DELETE FROM categories WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    /**
     * @return array{0: string, 1: string, 2: ?string, 3: int}
     */
    private static function validate(string $name, string $color, ?string $icon, int $sortOrder): array
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 64) {
            throw new InvalidArgumentException('Il nome è obbligatorio (max 64 caratteri).');
        }

        $color = trim($color);
        if ($color === '') {
            $color = '#6c757d';
        }
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw new InvalidArgumentException('Colore non valido. Usa un hex tipo #0d6efd.');
        }
        $color = strtolower($color);

        if ($icon !== null) {
            $icon = trim($icon);
            if ($icon === '') {
                $icon = null;
            } elseif (mb_strlen($icon) > 32) {
                throw new InvalidArgumentException('Nome icona troppo lungo (max 32 caratteri).');
            }
        }

        return [$name, $color, $icon, $sortOrder];
    }
}
