<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDOException;
use RuntimeException;

/**
 * Anagrafica fornitori/clienti. Tabella unica `contacts` con
 * type ∈ {supplier, customer, both}; collegata in modo opzionale a
 * expenses/incomes/recurring_expenses (FK ON DELETE SET NULL).
 *
 * `name_norm` viene calcolato in PHP via Contact::normalize() ed e' usato
 * per matching case-insensitive durante l'import dell'estratto conto.
 */
final class Contact
{
    public const TYPES = ['supplier', 'customer', 'both'];

    /**
     * Normalizza un nome per il match case-insensitive: lower, trim,
     * spazi multipli collassati. Stesso pattern usato in
     * BankStatementImporter::computeImportHash.
     */
    public static function normalize(string $name): string
    {
        $n = mb_strtolower(trim($name));
        $n = preg_replace('/\s+/', ' ', $n) ?? $n;
        return $n;
    }

    /**
     * @param  ?string $type Filtro: 'supplier' | 'customer' | null (tutti).
     *                       'supplier' include 'both'; 'customer' include 'both'.
     * @return array<int, array<string,mixed>>
     */
    public static function allForUser(
        int $userId,
        bool $includeArchived = false,
        ?string $type = null
    ): array {
        $sql = 'SELECT id, name, name_norm, type, vat_number, iban, email, notes,
                       color, archived, created_at, updated_at
                FROM contacts
                WHERE user_id = ?';
        $params = [$userId];
        if (!$includeArchived) {
            $sql .= ' AND archived = 0';
        }
        if ($type === 'supplier') {
            $sql .= " AND type IN ('supplier','both')";
        } elseif ($type === 'customer') {
            $sql .= " AND type IN ('customer','both')";
        }
        $sql .= ' ORDER BY name ASC';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, name, name_norm, type, vat_number, iban, email, notes,
                    color, archived, created_at, updated_at
             FROM contacts WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Cerca per name_norm gia' normalizzato (lookup esistenza in import). */
    public static function findByNormalizedName(int $userId, string $nameNorm): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, type, color FROM contacts
             WHERE user_id = ? AND name_norm = ? LIMIT 1'
        );
        $stmt->execute([$userId, $nameNorm]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Lookup case-insensitive per nome; se non esiste lo crea con il
     * tipo richiesto. Se esiste ed era di tipo opposto, viene promosso a 'both'.
     * Usato dai form ("crea al volo") e dall'import bancario.
     */
    public static function findOrCreate(int $userId, string $name, string $type = 'both'): int
    {
        $name = trim($name);
        if ($name === '') {
            throw new InvalidArgumentException('Nome anagrafica obbligatorio.');
        }
        $norm = self::normalize($name);
        $existing = self::findByNormalizedName($userId, $norm);
        if ($existing !== null) {
            $existingType = (string) $existing['type'];
            if ($existingType !== 'both' && $existingType !== $type && $type !== 'both') {
                $stmt = Database::pdo()->prepare(
                    'UPDATE contacts SET type = \'both\' WHERE id = ? AND user_id = ?'
                );
                $stmt->execute([(int) $existing['id'], $userId]);
            }
            return (int) $existing['id'];
        }
        return self::create($userId, $name, $type, []);
    }

    /**
     * @param array<string,mixed> $details Optional: vat_number, iban, email, notes, color
     */
    public static function create(int $userId, string $name, string $type, array $details = []): int
    {
        $row = self::validate($name, $type, $details);
        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO contacts
                    (user_id, name, name_norm, type, vat_number, iban, email, notes, color)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId, $row['name'], $row['name_norm'], $row['type'],
                $row['vat_number'], $row['iban'], $row['email'], $row['notes'], $row['color'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un'anagrafica '{$row['name']}'.");
            }
            throw $e;
        }
        return (int) Database::pdo()->lastInsertId();
    }

    /**
     * @param array<string,mixed> $details Optional: vat_number, iban, email, notes, color
     */
    public static function update(
        int $id, int $userId, string $name, string $type,
        array $details = [], bool $archived = false
    ): void {
        $row = self::validate($name, $type, $details);
        try {
            $stmt = Database::pdo()->prepare(
                'UPDATE contacts
                 SET name = ?, name_norm = ?, type = ?,
                     vat_number = ?, iban = ?, email = ?, notes = ?, color = ?,
                     archived = ?
                 WHERE id = ? AND user_id = ?'
            );
            $stmt->execute([
                $row['name'], $row['name_norm'], $row['type'],
                $row['vat_number'], $row['iban'], $row['email'], $row['notes'], $row['color'],
                $archived ? 1 : 0,
                $id, $userId,
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un'anagrafica '{$row['name']}'.");
            }
            throw $e;
        }
    }

    public static function archive(int $id, int $userId, bool $archived): void
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE contacts SET archived = ? WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$archived ? 1 : 0, $id, $userId]);
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'DELETE FROM contacts WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    /**
     * Conta quante spese/entrate/ricorrenti referenziano l'anagrafica.
     * @return array{expenses:int, incomes:int, recurring:int, total:int}
     */
    public static function usageCount(int $id, int $userId): array
    {
        $pdo = Database::pdo();
        $q = function (string $table, string $col) use ($pdo, $id, $userId): int {
            $stmt = $pdo->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE {$col} = ? AND user_id = ?"
            );
            $stmt->execute([$id, $userId]);
            return (int) $stmt->fetchColumn();
        };
        $e = $q('expenses', 'contact_id');
        $i = $q('incomes', 'contact_id');
        $r = $q('recurring_expenses', 'contact_id');
        return ['expenses' => $e, 'incomes' => $i, 'recurring' => $r, 'total' => $e + $i + $r];
    }

    /**
     * Bilancio sintetico per anagrafica nel periodo dato.
     * Combina spese ed entrate; ordina per |net| decrescente.
     *
     * @param ?string $type Filtro display 'supplier' | 'customer' | null
     * @return array<int, array<string,mixed>>
     */
    public static function balanceSummary(
        int $userId, string $fromDate, string $toDate, ?string $type = null
    ): array {
        $pdo = Database::pdo();

        $expSql = 'SELECT contact_id,
                          COALESCE(SUM(amount), 0) AS total,
                          COUNT(*)                 AS cnt
                   FROM expenses
                   WHERE user_id = ? AND contact_id IS NOT NULL
                     AND expense_date BETWEEN ? AND ?
                   GROUP BY contact_id';
        $stmt = $pdo->prepare($expSql);
        $stmt->execute([$userId, $fromDate, $toDate]);
        $exp = [];
        foreach ($stmt->fetchAll() as $r) {
            $exp[(int) $r['contact_id']] = [(float) $r['total'], (int) $r['cnt']];
        }

        $incSql = 'SELECT contact_id,
                          COALESCE(SUM(amount), 0) AS total,
                          COUNT(*)                 AS cnt
                   FROM incomes
                   WHERE user_id = ? AND contact_id IS NOT NULL
                     AND income_date BETWEEN ? AND ?
                   GROUP BY contact_id';
        $stmt = $pdo->prepare($incSql);
        $stmt->execute([$userId, $fromDate, $toDate]);
        $inc = [];
        foreach ($stmt->fetchAll() as $r) {
            $inc[(int) $r['contact_id']] = [(float) $r['total'], (int) $r['cnt']];
        }

        $ids = array_unique([...array_keys($exp), ...array_keys($inc)]);
        if (empty($ids)) return [];

        $in = implode(',', array_fill(0, count($ids), '?'));
        $sql = "SELECT id, name, type, color FROM contacts
                WHERE user_id = ? AND id IN ({$in})";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$userId, ...$ids]);
        $contacts = [];
        foreach ($stmt->fetchAll() as $c) {
            $contacts[(int) $c['id']] = $c;
        }

        $out = [];
        foreach ($ids as $cid) {
            if (!isset($contacts[$cid])) continue;
            $c = $contacts[$cid];
            if ($type === 'supplier' && !in_array($c['type'], ['supplier', 'both'], true)) continue;
            if ($type === 'customer' && !in_array($c['type'], ['customer', 'both'], true)) continue;

            $eTot = $exp[$cid][0] ?? 0.0;
            $eCnt = $exp[$cid][1] ?? 0;
            $iTot = $inc[$cid][0] ?? 0.0;
            $iCnt = $inc[$cid][1] ?? 0;
            $out[] = [
                'contact_id'      => $cid,
                'name'            => (string) $c['name'],
                'type'            => (string) $c['type'],
                'color'           => (string) $c['color'],
                'expenses_total'  => round($eTot, 2),
                'incomes_total'   => round($iTot, 2),
                'net'             => round($iTot - $eTot, 2),
                'expenses_count'  => $eCnt,
                'incomes_count'   => $iCnt,
            ];
        }
        usort($out, fn($a, $b) => abs($b['net']) <=> abs($a['net']));
        return $out;
    }

    /**
     * Distribuzione per categoria delle spese per un singolo contatto.
     * @return array<int, array<string,mixed>>
     */
    public static function breakdownByCategory(
        int $userId, int $contactId, string $fromDate, string $toDate
    ): array {
        $stmt = Database::pdo()->prepare(
            'SELECT c.id   AS category_id,
                    COALESCE(c.name, \'(senza categoria)\') AS category_name,
                    COALESCE(c.color, \'#6c757d\')          AS category_color,
                    COALESCE(c.icon,  \'tag\')              AS category_icon,
                    COALESCE(SUM(e.amount), 0)              AS total,
                    COUNT(*)                                AS cnt
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = ? AND e.contact_id = ?
               AND e.expense_date BETWEEN ? AND ?
             GROUP BY c.id, c.name, c.color, c.icon
             ORDER BY total DESC'
        );
        $stmt->execute([$userId, $contactId, $fromDate, $toDate]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[] = [
                'category_id'    => $r['category_id'] !== null ? (int) $r['category_id'] : null,
                'category_name'  => (string) $r['category_name'],
                'category_color' => (string) $r['category_color'],
                'category_icon'  => (string) $r['category_icon'],
                'total'          => round((float) $r['total'], 2),
                'count'          => (int) $r['cnt'],
            ];
        }
        return $out;
    }

    /**
     * @return array{name:string, name_norm:string, type:string, vat_number:?string,
     *               iban:?string, email:?string, notes:?string, color:string}
     */
    private static function validate(string $name, string $type, array $details): array
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 120) {
            throw new InvalidArgumentException('Nome anagrafica obbligatorio (max 120 caratteri).');
        }
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidArgumentException('Tipo anagrafica non valido.');
        }

        $vat   = isset($details['vat_number']) ? trim((string) $details['vat_number']) : '';
        $iban  = isset($details['iban'])       ? trim((string) $details['iban'])       : '';
        $email = isset($details['email'])      ? trim((string) $details['email'])      : '';
        $notes = isset($details['notes'])      ? trim((string) $details['notes'])      : '';
        $color = isset($details['color'])      ? trim((string) $details['color'])      : '';

        if ($vat !== '' && mb_strlen($vat) > 32) {
            throw new InvalidArgumentException('P.IVA / CF troppo lungo (max 32 caratteri).');
        }
        if ($iban !== '') {
            $iban = strtoupper(preg_replace('/\s+/', '', $iban));
            if (mb_strlen($iban) > 34) {
                throw new InvalidArgumentException('IBAN troppo lungo.');
            }
            if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', $iban)) {
                throw new InvalidArgumentException('Formato IBAN non valido.');
            }
        }
        if ($email !== '') {
            if (mb_strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('Email non valida.');
            }
        }
        if ($color === '') $color = '#6c757d';
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw new InvalidArgumentException('Colore non valido.');
        }

        return [
            'name'       => $name,
            'name_norm'  => self::normalize($name),
            'type'       => $type,
            'vat_number' => $vat   === '' ? null : $vat,
            'iban'       => $iban  === '' ? null : $iban,
            'email'      => $email === '' ? null : $email,
            'notes'      => $notes === '' ? null : $notes,
            'color'      => strtolower($color),
        ];
    }
}
