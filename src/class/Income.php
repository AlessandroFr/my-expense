<?php
declare(strict_types=1);

namespace App;

use DateTime;
use InvalidArgumentException;
use PDOException;

final class Income
{
    /**
     * @param array{
     *   date_from?: ?string, date_to?: ?string,
     *   source?: ?string, search?: ?string,
     *   limit?: int, offset?: int
     * } $filters
     * @return array<int, array<string,mixed>>
     */
    public static function listForUser(int $userId, array $filters = []): array
    {
        [$where, $params] = self::buildWhere($userId, $filters);

        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $sql = "SELECT i.id, i.user_id, i.contact_id, i.account_id, i.source, i.description, i.amount, i.income_date,
                       i.created_at, i.updated_at,
                       a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
                       co.name  AS contact_name,
                       co.color AS contact_color,
                       co.type  AS contact_type
                FROM incomes i
                LEFT JOIN accounts a  ON a.id  = i.account_id
                LEFT JOIN contacts co ON co.id = i.contact_id
                {$where}
                ORDER BY i.income_date DESC, i.id DESC
                LIMIT {$limit} OFFSET {$offset}";

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Conta le righe che matchano i filtri (per paginazione lato client).
     * @param array<string,mixed> $filters
     */
    public static function countForUser(int $userId, array $filters = []): int
    {
        [$where, $params] = self::buildWhere($userId, $filters);
        $sql = "SELECT COUNT(*) FROM incomes i
                LEFT JOIN accounts a  ON a.id  = i.account_id
                LEFT JOIN contacts co ON co.id = i.contact_id
                {$where}";
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT i.id, i.user_id, i.contact_id, i.account_id, i.source, i.description, i.amount, i.income_date,
                    i.created_at, i.updated_at,
                    a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
                    co.name  AS contact_name,
                    co.color AS contact_color,
                    co.type  AS contact_type
             FROM incomes i
             LEFT JOIN accounts a  ON a.id  = i.account_id
             LEFT JOIN contacts co ON co.id = i.contact_id
             WHERE i.id = ? AND i.user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function create(
        int $userId,
        string $source,
        ?string $description,
        string|float $amount,
        string $incomeDate,
        ?int $accountId = null,
        ?int $contactId = null
    ): int {
        $row = self::validate($source, $description, $amount, $incomeDate);
        $accountId = self::checkAccount($userId, $accountId);
        $contactId = self::checkContact($userId, $contactId);

        $stmt = Database::pdo()->prepare(
            'INSERT INTO incomes (user_id, account_id, contact_id, source, description, amount, income_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId, $accountId, $contactId, $row['source'], $row['description'], $row['amount'], $row['income_date'],
        ]);
        return (int) Database::pdo()->lastInsertId();
    }

    /**
     * Insert per import bancario: include value_date + import_hash; ritorna l'id
     * inserito oppure null se la riga e' un duplicato (unique constraint su
     * (user_id, import_hash) sollevata).
     */
    public const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

    public static function createImported(
        int $userId,
        string $source,
        ?string $description,
        string|float $amount,
        string $incomeDate,
        ?int $accountId,
        ?string $valueDate,
        string $importHash,
        ?string $paymentMethod = 'transfer',
        ?int $contactId = null
    ): ?int {
        $row = self::validate($source, $description, $amount, $incomeDate);
        $payment = self::normalizePayment($paymentMethod);
        $accountId = self::checkAccount($userId, $accountId, $payment);
        $contactId = self::checkContact($userId, $contactId);
        if ($valueDate !== null && !self::isValidDate($valueDate)) {
            throw new InvalidArgumentException('Data valuta non valida.');
        }

        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO incomes (user_id, account_id, contact_id, source, description, amount,
                                      payment_method, income_date, value_date, import_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId, $accountId, $contactId, $row['source'], $row['description'], $row['amount'],
                $payment, $row['income_date'], $valueDate, $importHash,
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000' && (int) ($e->errorInfo[1] ?? 0) === 1062) {
                return null;
            }
            throw $e;
        }

        return (int) Database::pdo()->lastInsertId();
    }

    private static function normalizePayment(?string $payment): string
    {
        if ($payment === null || $payment === '') return 'transfer';
        $p = strtolower(trim($payment));
        return in_array($p, self::PAYMENT_METHODS, true) ? $p : 'transfer';
    }

    public static function update(
        int $id,
        int $userId,
        string $source,
        ?string $description,
        string|float $amount,
        string $incomeDate,
        ?int $accountId = null,
        ?int $contactId = null
    ): void {
        $row = self::validate($source, $description, $amount, $incomeDate);
        $accountId = self::checkAccount($userId, $accountId);
        $contactId = self::checkContact($userId, $contactId);

        $stmt = Database::pdo()->prepare(
            'UPDATE incomes
             SET account_id = ?, contact_id = ?, source = ?, description = ?, amount = ?, income_date = ?
             WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([
            $accountId, $contactId, $row['source'], $row['description'], $row['amount'], $row['income_date'],
            $id, $userId,
        ]);
    }

    private static function checkContact(int $userId, ?int $contactId): ?int
    {
        if ($contactId === null || $contactId <= 0) return null;
        $check = Database::pdo()->prepare(
            'SELECT 1 FROM contacts WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $check->execute([$contactId, $userId]);
        if ($check->fetchColumn() === false) {
            throw new InvalidArgumentException('Anagrafica non trovata.');
        }
        return $contactId;
    }

    private static function checkAccount(int $userId, ?int $accountId, ?string $paymentMethod = null): ?int
    {
        if ($accountId === null || $accountId <= 0) {
            if ($paymentMethod === 'cash') {
                throw new InvalidArgumentException(
                    'Per le entrate in contanti devi selezionare un conto cassa.'
                );
            }
            return null;
        }
        $check = Database::pdo()->prepare(
            'SELECT type FROM accounts WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $check->execute([$accountId, $userId]);
        $type = $check->fetchColumn();
        if ($type === false) {
            throw new InvalidArgumentException('Conto non trovato.');
        }
        if ($paymentMethod === 'cash' && (string) $type !== 'cash') {
            throw new InvalidArgumentException(
                'Il conto selezionato non e\' un conto cassa: scegli "In tasca" o un altro conto Contanti.'
            );
        }
        return $accountId;
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare('DELETE FROM incomes WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
    }

    public static function monthlyTotal(int $userId, ?string $yearMonth = null): float
    {
        $ym    = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(amount), 0) FROM incomes i
             WHERE i.user_id = ? AND i.income_date >= ? AND i.income_date < ?
               AND i.is_transfer = 0'
        );
        $stmt->execute([$userId, $start, $end]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * Totale entrate in un range di date (inclusive).
     */
    public static function totalForRange(int $userId, string $from, string $to): float
    {
        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(amount), 0) FROM incomes
             WHERE user_id = ? AND income_date >= ? AND income_date <= ?
               AND is_transfer = 0'
        );
        $stmt->execute([$userId, $from, $to]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * @return array<int, array{month:string, total:float}>
     */
    public static function totalsByMonth(int $userId, int $monthsBack = 6): array
    {
        $monthsBack = max(1, min(36, $monthsBack));
        $stmt = Database::pdo()->prepare(
            "SELECT DATE_FORMAT(i.income_date, '%Y-%m') AS month,
                    SUM(i.amount) AS total
             FROM incomes i
             WHERE i.user_id = ?
               AND i.income_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
               AND i.is_transfer = 0
             GROUP BY month
             ORDER BY month ASC"
        );
        $stmt->execute([$userId, $monthsBack - 1]);
        return array_map(static function (array $r): array {
            return ['month' => (string) $r['month'], 'total' => (float) $r['total']];
        }, $stmt->fetchAll());
    }

    /** @return array<int, string> */
    public static function distinctSources(int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT DISTINCT source FROM incomes i WHERE i.user_id = ? ORDER BY source ASC'
        );
        $stmt->execute([$userId]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    /**
     * @return array{0: string, 1: array<int|string, mixed>}
     */
    private static function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['i.user_id = ?'];
        $params  = [$userId];

        if (!empty($filters['date_from']) && self::isValidDate((string) $filters['date_from'])) {
            $clauses[] = 'i.income_date >= ?';
            $params[]  = $filters['date_from'];
        }
        if (!empty($filters['date_to']) && self::isValidDate((string) $filters['date_to'])) {
            $clauses[] = 'i.income_date <= ?';
            $params[]  = $filters['date_to'];
        }
        if (!empty($filters['source'])) {
            $clauses[] = 'i.source = ?';
            $params[]  = (string) $filters['source'];
        }
        if (!empty($filters['account_id'])) {
            $clauses[] = 'i.account_id = ?';
            $params[]  = (int) $filters['account_id'];
        }
        if (!empty($filters['contact_id'])) {
            $clauses[] = 'i.contact_id = ?';
            $params[]  = (int) $filters['contact_id'];
        }
        if (!empty($filters['search'])) {
            $clauses[] = '(i.description LIKE ? OR i.source LIKE ?)';
            $params[]  = '%' . $filters['search'] . '%';
            $params[]  = '%' . $filters['search'] . '%';
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }

    /**
     * @return array{source:string, description:?string, amount:string, income_date:string}
     */
    private static function validate(
        string $source,
        ?string $description,
        string|float $amount,
        string $incomeDate
    ): array {
        $source = trim($source);
        if ($source === '' || mb_strlen($source) > 64) {
            throw new InvalidArgumentException('Origine entrata obbligatoria (max 64 caratteri).');
        }

        $amountF = is_string($amount) ? (float) str_replace(',', '.', $amount) : (float) $amount;
        if ($amountF < 0.01) {
            throw new InvalidArgumentException('Importo non valido (minimo 0.01).');
        }
        if ($amountF > 99999999.99) {
            throw new InvalidArgumentException('Importo troppo grande.');
        }

        if (!self::isValidDate($incomeDate)) {
            throw new InvalidArgumentException('Data non valida (formato YYYY-MM-DD).');
        }

        $description = $description === null ? null : trim($description);
        if ($description === '') $description = null;
        if ($description !== null && mb_strlen($description) > 8192) {
            throw new InvalidArgumentException('Descrizione troppo lunga (max 8192 caratteri).');
        }

        return [
            'source'      => $source,
            'description' => $description,
            'amount'      => number_format($amountF, 2, '.', ''),
            'income_date' => $incomeDate,
        ];
    }

    private static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }
}
