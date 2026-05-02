<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDOException;
use RuntimeException;

final class Account
{
    public const TYPES = ['checking', 'card', 'cash', 'savings', 'other'];

    /** @return array<int, array<string,mixed>> */
    public static function allForUser(int $userId, bool $includeArchived = false): array
    {
        $sql = 'SELECT id, name, type, color, icon, opening_balance, archived, sort_order, created_at, updated_at
                FROM accounts
                WHERE user_id = ?'
             . ($includeArchived ? '' : ' AND archived = 0')
             . ' ORDER BY sort_order ASC, name ASC';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, name, type, color, icon, opening_balance, archived, sort_order
             FROM accounts WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<int, array<string,mixed>> */
    public static function withBalances(int $userId, bool $includeArchived = false): array
    {
        $accounts = self::allForUser($userId, $includeArchived);
        if (empty($accounts)) return [];

        $ids = array_column($accounts, 'id');
        $in  = implode(',', array_fill(0, count($ids), '?'));

        $sums = [];
        foreach ($ids as $id) $sums[$id] = ['exp' => 0.0, 'inc' => 0.0];

        $stmt = Database::pdo()->prepare(
            "SELECT account_id, COALESCE(SUM(amount),0) AS total
             FROM expenses WHERE user_id = ? AND account_id IN ({$in})
             GROUP BY account_id"
        );
        $stmt->execute([$userId, ...$ids]);
        foreach ($stmt->fetchAll() as $r) {
            $sums[(int) $r['account_id']]['exp'] = (float) $r['total'];
        }

        $stmt = Database::pdo()->prepare(
            "SELECT account_id, COALESCE(SUM(amount),0) AS total
             FROM incomes WHERE user_id = ? AND account_id IN ({$in})
             GROUP BY account_id"
        );
        $stmt->execute([$userId, ...$ids]);
        foreach ($stmt->fetchAll() as $r) {
            $sums[(int) $r['account_id']]['inc'] = (float) $r['total'];
        }

        foreach ($accounts as &$a) {
            $aid = (int) $a['id'];
            $opening = (float) $a['opening_balance'];
            $a['expenses_total'] = round($sums[$aid]['exp'], 2);
            $a['incomes_total']  = round($sums[$aid]['inc'], 2);
            $a['balance']        = round($opening + $sums[$aid]['inc'] - $sums[$aid]['exp'], 2);
        }
        unset($a);
        return $accounts;
    }

    public static function create(
        int $userId, string $name, string $type, string $color,
        ?string $icon, string|float $openingBalance, int $sortOrder = 0
    ): int {
        $row = self::validate($name, $type, $color, $icon, $openingBalance, $sortOrder);
        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId, $row['name'], $row['type'], $row['color'], $row['icon'],
                $row['opening_balance'], $row['sort_order'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un conto '{$row['name']}'.");
            }
            throw $e;
        }
        return (int) Database::pdo()->lastInsertId();
    }

    public static function update(
        int $id, int $userId, string $name, string $type, string $color,
        ?string $icon, string|float $openingBalance, int $sortOrder = 0,
        bool $archived = false
    ): void {
        $row = self::validate($name, $type, $color, $icon, $openingBalance, $sortOrder);
        try {
            $stmt = Database::pdo()->prepare(
                'UPDATE accounts
                 SET name = ?, type = ?, color = ?, icon = ?,
                     opening_balance = ?, sort_order = ?, archived = ?
                 WHERE id = ? AND user_id = ?'
            );
            $stmt->execute([
                $row['name'], $row['type'], $row['color'], $row['icon'],
                $row['opening_balance'], $row['sort_order'], $archived ? 1 : 0,
                $id, $userId,
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un conto '{$row['name']}'.");
            }
            throw $e;
        }
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
    }

    /**
     * @return array{name:string, type:string, color:string, icon:?string, opening_balance:string, sort_order:int}
     */
    private static function validate(
        string $name, string $type, string $color, ?string $icon,
        string|float $openingBalance, int $sortOrder
    ): array {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 64) {
            throw new InvalidArgumentException('Nome conto obbligatorio (max 64 caratteri).');
        }
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidArgumentException('Tipo conto non valido.');
        }
        $color = trim($color);
        if ($color === '') $color = '#6c757d';
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw new InvalidArgumentException('Colore non valido.');
        }
        if ($icon !== null) {
            $icon = trim($icon);
            if ($icon === '') $icon = null;
            elseif (mb_strlen($icon) > 32) {
                throw new InvalidArgumentException('Nome icona troppo lungo.');
            }
        }
        $obF = is_string($openingBalance) ? (float) str_replace(',', '.', $openingBalance) : (float) $openingBalance;
        if ($obF < -99999999.99 || $obF > 99999999.99) {
            throw new InvalidArgumentException('Saldo iniziale fuori range.');
        }
        return [
            'name'            => $name,
            'type'            => $type,
            'color'           => strtolower($color),
            'icon'            => $icon,
            'opening_balance' => number_format($obF, 2, '.', ''),
            'sort_order'      => $sortOrder,
        ];
    }
}
