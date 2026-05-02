<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use RuntimeException;

final class SavedFilter
{
    /** @return array<int, array<string,mixed>> */
    public static function listForUser(int $userId, string $scope = 'expenses'): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, scope, name, payload, created_at
             FROM saved_filters
             WHERE user_id = ? AND scope = ?
             ORDER BY name ASC'
        );
        $stmt->execute([$userId, $scope]);
        return array_map(static function (array $r): array {
            $payload = is_string($r['payload']) ? json_decode($r['payload'], true) : $r['payload'];
            return [
                'id'         => (int) $r['id'],
                'scope'      => (string) $r['scope'],
                'name'       => (string) $r['name'],
                'payload'    => is_array($payload) ? $payload : [],
                'created_at' => (string) $r['created_at'],
            ];
        }, $stmt->fetchAll());
    }

    /** Upsert per (user, scope, name). */
    public static function save(int $userId, string $scope, string $name, array $payload): int
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 64) {
            throw new InvalidArgumentException('Nome filtro obbligatorio (max 64 caratteri).');
        }
        $scope = trim($scope) === '' ? 'expenses' : $scope;
        if (mb_strlen($scope) > 32) {
            throw new InvalidArgumentException('Scope troppo lungo.');
        }
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Impossibile serializzare i filtri.');
        }

        $stmt = Database::pdo()->prepare(
            'INSERT INTO saved_filters (user_id, scope, name, payload)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE payload = VALUES(payload)'
        );
        $stmt->execute([$userId, $scope, $name, $json]);
        return (int) Database::pdo()->lastInsertId();
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'DELETE FROM saved_filters WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }
}
