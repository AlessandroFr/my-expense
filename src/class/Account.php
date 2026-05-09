<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDOException;
use RuntimeException;

final class Account
{
    public const TYPES = ['checking', 'card', 'cash', 'savings', 'investment', 'other'];

    private const DETAIL_FIELDS = ['iban', 'bic', 'bank_name', 'account_holder', 'account_number', 'notes'];

    /** @return array<int, array<string,mixed>> */
    public static function allForUser(int $userId, bool $includeArchived = false): array
    {
        $sql = 'SELECT id, name, type, color, icon, opening_balance,
                       iban, bic, bank_name, account_holder, account_number, notes,
                       archived, is_default_cash, sort_order, created_at, updated_at
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
            'SELECT id, user_id, name, type, color, icon, opening_balance,
                    iban, bic, bank_name, account_holder, account_number, notes,
                    archived, is_default_cash, sort_order
             FROM accounts WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Conto cassa designato per i contanti dell'utente:
     * type='cash' AND is_default_cash=1; fallback al primo cash per
     * sort_order/id; null se l'utente non ha alcun conto cash.
     */
    public static function defaultCashFor(int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, name, type, color, icon, opening_balance,
                    archived, is_default_cash, sort_order
             FROM accounts
             WHERE user_id = ? AND type = \'cash\'
             ORDER BY is_default_cash DESC, sort_order ASC, id ASC
             LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Garantisce l'esistenza di un conto cassa per l'utente. Se manca,
     * crea "In tasca" (verde, icona wallet2) e lo marca default.
     * Ritorna l'id del conto cassa (esistente o appena creato).
     */
    public static function ensureDefaultCash(int $userId): int
    {
        $existing = self::defaultCashFor($userId);
        if ($existing !== null) {
            return (int) $existing['id'];
        }
        return self::create(
            $userId, 'In tasca', 'cash', '#20c997',
            'wallet2', '0.00', 50, [], true
        );
    }

    /**
     * Lookup case-insensitive per nome; se non esiste lo crea con i
     * parametri forniti. Sostituisce il vecchio resolvePrepaidAccount
     * di BankStatementImporter rendendo il pattern riusabile.
     */
    public static function findOrCreateByName(
        int $userId, string $name, string $type,
        string $color, string $icon, int $sortOrder = 100
    ): int {
        $needle = mb_strtolower($name);
        foreach (self::allForUser($userId, true) as $a) {
            if (mb_strtolower((string) $a['name']) === $needle) {
                return (int) $a['id'];
            }
        }
        return self::create($userId, $name, $type, $color, $icon, '0.00', $sortOrder);
    }

    /**
     * Saldo live di un singolo conto (versione one-shot di withBalances).
     * Ritorna opening_balance + somma entrate − somma spese.
     */
    public static function balanceFor(int $userId, int $accountId): float
    {
        $stmt = Database::pdo()->prepare(
            'SELECT opening_balance FROM accounts
             WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$accountId, $userId]);
        $opening = $stmt->fetchColumn();
        if ($opening === false) {
            return 0.0;
        }

        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(amount), 0) FROM expenses
             WHERE user_id = ? AND account_id = ?'
        );
        $stmt->execute([$userId, $accountId]);
        $exp = (float) $stmt->fetchColumn();

        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(amount), 0) FROM incomes
             WHERE user_id = ? AND account_id = ?'
        );
        $stmt->execute([$userId, $accountId]);
        $inc = (float) $stmt->fetchColumn();

        return round((float) $opening + $inc - $exp, 2);
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

    /**
     * @param array<string,mixed> $details Optional: iban, bic, bank_name, account_holder, account_number, notes
     */
    public static function create(
        int $userId, string $name, string $type, string $color,
        ?string $icon, string|float $openingBalance, int $sortOrder = 0,
        array $details = [], bool $isDefaultCash = false
    ): int {
        $row     = self::validate($name, $type, $color, $icon, $openingBalance, $sortOrder, $isDefaultCash);
        $details = self::normalizeDetails($details);
        $pdo     = Database::pdo();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO accounts
                    (user_id, name, type, color, icon, opening_balance, sort_order,
                     iban, bic, bank_name, account_holder, account_number, notes,
                     is_default_cash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId, $row['name'], $row['type'], $row['color'], $row['icon'],
                $row['opening_balance'], $row['sort_order'],
                $details['iban'], $details['bic'], $details['bank_name'],
                $details['account_holder'], $details['account_number'], $details['notes'],
                $isDefaultCash ? 1 : 0,
            ]);
            $newId = (int) $pdo->lastInsertId();
            if ($isDefaultCash) {
                self::clearOtherDefaultCash($userId, $newId);
            }
            $pdo->commit();
            return $newId;
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un conto '{$row['name']}'.");
            }
            throw $e;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * @param array<string,mixed> $details Optional: iban, bic, bank_name, account_holder, account_number, notes
     */
    public static function update(
        int $id, int $userId, string $name, string $type, string $color,
        ?string $icon, string|float $openingBalance, int $sortOrder = 0,
        bool $archived = false, array $details = [], bool $isDefaultCash = false
    ): void {
        $row     = self::validate($name, $type, $color, $icon, $openingBalance, $sortOrder, $isDefaultCash);
        $details = self::normalizeDetails($details);
        $pdo     = Database::pdo();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'UPDATE accounts
                 SET name = ?, type = ?, color = ?, icon = ?,
                     opening_balance = ?, sort_order = ?, archived = ?,
                     iban = ?, bic = ?, bank_name = ?,
                     account_holder = ?, account_number = ?, notes = ?,
                     is_default_cash = ?
                 WHERE id = ? AND user_id = ?'
            );
            $stmt->execute([
                $row['name'], $row['type'], $row['color'], $row['icon'],
                $row['opening_balance'], $row['sort_order'], $archived ? 1 : 0,
                $details['iban'], $details['bic'], $details['bank_name'],
                $details['account_holder'], $details['account_number'], $details['notes'],
                $isDefaultCash ? 1 : 0,
                $id, $userId,
            ]);
            if ($isDefaultCash) {
                self::clearOtherDefaultCash($userId, $id);
            }
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un conto '{$row['name']}'.");
            }
            throw $e;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Toglie il flag is_default_cash da tutti i conti dell'utente
     * tranne quello appena promosso. Garantisce l'unicita' del default
     * (vincolo applicativo: MySQL non supporta UNIQUE parziali).
     */
    private static function clearOtherDefaultCash(int $userId, int $keepId): void
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE accounts SET is_default_cash = 0
             WHERE user_id = ? AND id <> ? AND is_default_cash = 1'
        );
        $stmt->execute([$userId, $keepId]);
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
        string|float $openingBalance, int $sortOrder,
        bool $isDefaultCash = false
    ): array {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 64) {
            throw new InvalidArgumentException('Nome conto obbligatorio (max 64 caratteri).');
        }
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidArgumentException('Tipo conto non valido.');
        }
        if ($isDefaultCash && $type !== 'cash') {
            throw new InvalidArgumentException(
                'Il flag "Conto cassa principale" e\' valido solo per conti di tipo Contanti.'
            );
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

    /**
     * @param  array<string,mixed> $details
     * @return array{iban:?string, bic:?string, bank_name:?string, account_holder:?string, account_number:?string, notes:?string}
     */
    private static function normalizeDetails(array $details): array
    {
        $out = [];
        foreach (self::DETAIL_FIELDS as $f) {
            $v = isset($details[$f]) ? trim((string) $details[$f]) : '';
            $out[$f] = $v === '' ? null : $v;
        }

        if ($out['iban'] !== null) {
            $iban = strtoupper(preg_replace('/\s+/', '', $out['iban']));
            if (mb_strlen($iban) > 34) {
                throw new InvalidArgumentException('IBAN troppo lungo (max 34 caratteri).');
            }
            if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', $iban)) {
                throw new InvalidArgumentException('Formato IBAN non valido.');
            }
            $out['iban'] = $iban;
        }

        if ($out['bic'] !== null) {
            $bic = strtoupper(preg_replace('/\s+/', '', $out['bic']));
            if (!preg_match('/^[A-Z0-9]{8}([A-Z0-9]{3})?$/', $bic)) {
                throw new InvalidArgumentException('Formato BIC/SWIFT non valido (8 o 11 caratteri).');
            }
            $out['bic'] = $bic;
        }

        $maxLen = ['bank_name' => 128, 'account_holder' => 128, 'account_number' => 64, 'notes' => 255];
        foreach ($maxLen as $f => $max) {
            if ($out[$f] !== null && mb_strlen((string) $out[$f]) > $max) {
                throw new InvalidArgumentException("Campo {$f} troppo lungo (max {$max}).");
            }
        }

        return $out;
    }
}
