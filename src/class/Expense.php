<?php
declare(strict_types=1);

namespace App;

use DateTime;
use InvalidArgumentException;
use PDOException;

final class Expense
{
    public const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

    /**
     * @param array{
     *   date_from?: ?string, date_to?: ?string,
     *   category_id?: ?int, amount_min?: ?float, amount_max?: ?float,
     *   search?: ?string, limit?: int, offset?: int
     * } $filters
     * @return array<int, array<string,mixed>>
     */
    public static function listForUser(int $userId, array $filters = []): array
    {
        [$where, $params] = self::buildWhere($userId, $filters);

        $limit  = max(1, min(500, (int) ($filters['limit']  ?? 200)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));

        $sql = "SELECT e.id, e.user_id, e.category_id, e.contact_id, e.account_id, e.amount, e.description,
                       e.shared_with, e.share_amount,
                       e.payment_method, e.expense_date, e.created_at, e.updated_at,
                       c.name  AS category_name,
                       c.color AS category_color,
                       c.icon  AS category_icon,
                       a.name  AS account_name,
                       a.color AS account_color,
                       a.icon  AS account_icon,
                       co.name  AS contact_name,
                       co.color AS contact_color,
                       co.type  AS contact_type
                FROM expenses e
                LEFT JOIN categories c  ON c.id  = e.category_id
                LEFT JOIN accounts   a  ON a.id  = e.account_id
                LEFT JOIN contacts   co ON co.id = e.contact_id
                {$where}
                ORDER BY e.expense_date DESC, e.id DESC
                LIMIT {$limit} OFFSET {$offset}";

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        // Tags batch-fetch (un singolo query per tutte le righe).
        if (!empty($rows)) {
            $ids = array_column($rows, 'id');
            $in  = implode(',', array_fill(0, count($ids), '?'));
            $tagStmt = Database::pdo()->prepare(
                "SELECT et.expense_id, t.id, t.name, t.color
                 FROM expense_tags et
                 INNER JOIN tags t ON t.id = et.tag_id
                 WHERE et.expense_id IN ({$in}) AND t.user_id = ?
                 ORDER BY t.name ASC"
            );
            $tagStmt->execute([...$ids, $userId]);
            $byExp = [];
            foreach ($tagStmt->fetchAll() as $tr) {
                $byExp[(int) $tr['expense_id']][] = [
                    'id'    => (int) $tr['id'],
                    'name'  => (string) $tr['name'],
                    'color' => (string) $tr['color'],
                ];
            }
            foreach ($rows as &$r) {
                $r['tags'] = $byExp[(int) $r['id']] ?? [];
            }
            unset($r);
        }

        return $rows;
    }

    /**
     * Conta le righe che matchano i filtri (per paginazione lato client).
     * @param array<string,mixed> $filters
     */
    public static function countForUser(int $userId, array $filters = []): int
    {
        [$where, $params] = self::buildWhere($userId, $filters);
        $sql = "SELECT COUNT(*) FROM expenses e
                LEFT JOIN categories c  ON c.id  = e.category_id
                LEFT JOIN accounts   a  ON a.id  = e.account_id
                LEFT JOIN contacts   co ON co.id = e.contact_id
                {$where}";
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT e.id, e.user_id, e.category_id, e.contact_id, e.account_id, e.amount, e.description,
                    e.shared_with, e.share_amount,
                    e.payment_method, e.expense_date, e.created_at, e.updated_at,
                    c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                    a.name AS account_name,  a.color AS account_color,  a.icon AS account_icon,
                    co.name  AS contact_name,
                    co.color AS contact_color,
                    co.type  AS contact_type
             FROM expenses e
             LEFT JOIN categories c  ON c.id  = e.category_id
             LEFT JOIN accounts   a  ON a.id  = e.account_id
             LEFT JOIN contacts   co ON co.id = e.contact_id
             WHERE e.id = ? AND e.user_id = ?
             LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function create(
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $expenseDate,
        ?int $accountId = null,
        ?string $sharedWith = null,
        string|float|null $shareAmount = null,
        ?int $contactId = null
    ): int {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate, $accountId, $sharedWith, $shareAmount, $contactId);

        $stmt = Database::pdo()->prepare(
            'INSERT INTO expenses (user_id, category_id, contact_id, account_id, amount, description,
                                   shared_with, share_amount, payment_method, expense_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $row['category_id'],
            $row['contact_id'],
            $row['account_id'],
            $row['amount'],
            $row['description'],
            $row['shared_with'],
            $row['share_amount'],
            $row['payment_method'],
            $row['expense_date'],
        ]);

        return (int) Database::pdo()->lastInsertId();
    }

    /**
     * Insert per import bancario: include value_date + import_hash; ritorna l'id
     * inserito oppure null se la riga e' un duplicato (unique constraint su
     * (user_id, import_hash) sollevata).
     */
    public static function createImported(
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $expenseDate,
        ?int $accountId,
        ?string $valueDate,
        string $importHash,
        ?int $contactId = null
    ): ?int {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate, $accountId, null, null, $contactId);
        if ($valueDate !== null && !self::isValidDate($valueDate)) {
            throw new InvalidArgumentException('Data valuta non valida.');
        }

        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO expenses (user_id, category_id, contact_id, account_id, amount, description,
                                       payment_method, expense_date, value_date, import_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId,
                $row['category_id'],
                $row['contact_id'],
                $row['account_id'],
                $row['amount'],
                $row['description'],
                $row['payment_method'],
                $row['expense_date'],
                $valueDate,
                $importHash,
            ]);
        } catch (PDOException $e) {
            // 23000 + errno 1062 = duplicate key on (user_id, import_hash)
            if ($e->getCode() === '23000' && (int) ($e->errorInfo[1] ?? 0) === 1062) {
                return null;
            }
            throw $e;
        }

        return (int) Database::pdo()->lastInsertId();
    }

    public static function update(
        int $id,
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $expenseDate,
        ?int $accountId = null,
        ?string $sharedWith = null,
        string|float|null $shareAmount = null,
        ?int $contactId = null
    ): void {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate, $accountId, $sharedWith, $shareAmount, $contactId);

        $stmt = Database::pdo()->prepare(
            'UPDATE expenses
             SET category_id = ?, contact_id = ?, account_id = ?, amount = ?, description = ?,
                 shared_with = ?, share_amount = ?,
                 payment_method = ?, expense_date = ?
             WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([
            $row['category_id'],
            $row['contact_id'],
            $row['account_id'],
            $row['amount'],
            $row['description'],
            $row['shared_with'],
            $row['share_amount'],
            $row['payment_method'],
            $row['expense_date'],
            $id,
            $userId,
        ]);
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'DELETE FROM expenses WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    /**
     * Totale del mese specificato (YYYY-MM, default mese odierno).
     */
    public static function monthlyTotal(int $userId, ?string $yearMonth = null): float
    {
        $ym = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(amount), 0)
             FROM expenses
             WHERE user_id = ? AND expense_date >= ? AND expense_date < ?'
        );
        $stmt->execute([$userId, $start, $end]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * Aggregato per categoria nel mese specificato (YYYY-MM).
     * @return array<int, array{category_id: ?int, name: string, color: string, icon: ?string, total: float}>
     */
    public static function totalsByCategoryForMonth(int $userId, ?string $yearMonth = null): array
    {
        $ym = $yearMonth ?? date('Y-m');
        $start = $ym . '-01';
        $end   = date('Y-m-d', strtotime($start . ' +1 month'));

        $stmt = Database::pdo()->prepare(
            "SELECT
                e.category_id,
                COALESCE(c.name, 'Senza categoria') AS name,
                COALESCE(c.color, '#6c757d')         AS color,
                c.icon                                AS icon,
                SUM(e.amount)                         AS total
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date < ?
             GROUP BY e.category_id, c.name, c.color, c.icon
             ORDER BY total DESC"
        );
        $stmt->execute([$userId, $start, $end]);
        return array_map(static function (array $r): array {
            return [
                'category_id' => $r['category_id'] === null ? null : (int) $r['category_id'],
                'name'        => (string) $r['name'],
                'color'       => (string) $r['color'],
                'icon'        => $r['icon'],
                'total'       => (float) $r['total'],
            ];
        }, $stmt->fetchAll());
    }

    /**
     * Totali per gli ultimi N mesi (default 6), ordinati cronologicamente.
     * @return array<int, array{month: string, total: float}>
     */
    public static function totalsByMonth(int $userId, int $monthsBack = 6): array
    {
        $monthsBack = max(1, min(36, $monthsBack));
        $stmt = Database::pdo()->prepare(
            "SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month,
                    SUM(amount) AS total
             FROM expenses
             WHERE user_id = ?
               AND expense_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
             GROUP BY month
             ORDER BY month ASC"
        );
        $stmt->execute([$userId, $monthsBack - 1]);
        return array_map(static function (array $r): array {
            return ['month' => (string) $r['month'], 'total' => (float) $r['total']];
        }, $stmt->fetchAll());
    }

    /**
     * @return array{0: string, 1: array<int|string, mixed>}
     */
    private static function buildWhere(int $userId, array $filters): array
    {
        $clauses = ['e.user_id = ?'];
        $params  = [$userId];

        if (!empty($filters['date_from']) && self::isValidDate((string) $filters['date_from'])) {
            $clauses[] = 'e.expense_date >= ?';
            $params[]  = $filters['date_from'];
        }
        if (!empty($filters['date_to']) && self::isValidDate((string) $filters['date_to'])) {
            $clauses[] = 'e.expense_date <= ?';
            $params[]  = $filters['date_to'];
        }
        if (!empty($filters['category_id'])) {
            $clauses[] = 'e.category_id = ?';
            $params[]  = (int) $filters['category_id'];
        }
        if (!empty($filters['account_id'])) {
            $clauses[] = 'e.account_id = ?';
            $params[]  = (int) $filters['account_id'];
        }
        if (!empty($filters['contact_id'])) {
            $clauses[] = 'e.contact_id = ?';
            $params[]  = (int) $filters['contact_id'];
        }
        if (isset($filters['amount_min']) && $filters['amount_min'] !== '' && $filters['amount_min'] !== null) {
            $clauses[] = 'e.amount >= ?';
            $params[]  = (float) $filters['amount_min'];
        }
        if (isset($filters['amount_max']) && $filters['amount_max'] !== '' && $filters['amount_max'] !== null) {
            $clauses[] = 'e.amount <= ?';
            $params[]  = (float) $filters['amount_max'];
        }
        if (!empty($filters['search'])) {
            $clauses[] = 'e.description LIKE ?';
            $params[]  = '%' . $filters['search'] . '%';
        }
        if (!empty($filters['tag'])) {
            $clauses[] = 'EXISTS (
                SELECT 1 FROM expense_tags et2
                INNER JOIN tags t2 ON t2.id = et2.tag_id
                WHERE et2.expense_id = e.id AND t2.user_id = e.user_id AND t2.name = ?
            )';
            $params[]  = (string) $filters['tag'];
        }

        return ['WHERE ' . implode(' AND ', $clauses), $params];
    }

    /**
     * @return array{
     *   category_id: ?int, contact_id: ?int, account_id: ?int, amount: string, description: ?string,
     *   shared_with: ?string, share_amount: ?string,
     *   payment_method: string, expense_date: string
     * }
     */
    private static function validate(
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $expenseDate,
        ?int $accountId = null,
        ?string $sharedWith = null,
        string|float|null $shareAmount = null,
        ?int $contactId = null
    ): array {
        $amountF = is_string($amount) ? (float) str_replace(',', '.', $amount) : (float) $amount;
        if ($amountF < 0.01) {
            throw new InvalidArgumentException('Importo non valido (minimo 0.01).');
        }
        if ($amountF > 99999999.99) {
            throw new InvalidArgumentException('Importo troppo grande.');
        }

        if (!in_array($paymentMethod, self::PAYMENT_METHODS, true)) {
            throw new InvalidArgumentException(
                'Metodo di pagamento non valido (ammessi: ' . implode(', ', self::PAYMENT_METHODS) . ').'
            );
        }

        if (!self::isValidDate($expenseDate)) {
            throw new InvalidArgumentException('Data non valida (formato richiesto: YYYY-MM-DD).');
        }

        $description = $description === null ? null : trim($description);
        if ($description === '') {
            $description = null;
        }
        if ($description !== null && mb_strlen($description) > 8192) {
            throw new InvalidArgumentException('Descrizione troppo lunga (max 8192 caratteri).');
        }

        if ($categoryId !== null) {
            if ($categoryId <= 0) {
                $categoryId = null;
            } else {
                $check = Database::pdo()->prepare(
                    'SELECT 1 FROM categories WHERE id = ? AND user_id = ? LIMIT 1'
                );
                $check->execute([$categoryId, $userId]);
                if ($check->fetchColumn() === false) {
                    throw new InvalidArgumentException('Categoria non trovata.');
                }
            }
        }

        if ($contactId !== null) {
            if ($contactId <= 0) {
                $contactId = null;
            } else {
                $check = Database::pdo()->prepare(
                    'SELECT 1 FROM contacts WHERE id = ? AND user_id = ? LIMIT 1'
                );
                $check->execute([$contactId, $userId]);
                if ($check->fetchColumn() === false) {
                    throw new InvalidArgumentException('Anagrafica non trovata.');
                }
            }
        }

        $accountType = null;
        if ($accountId !== null) {
            if ($accountId <= 0) {
                $accountId = null;
            } else {
                $check = Database::pdo()->prepare(
                    'SELECT type FROM accounts WHERE id = ? AND user_id = ? LIMIT 1'
                );
                $check->execute([$accountId, $userId]);
                $accountType = $check->fetchColumn();
                if ($accountType === false) {
                    throw new InvalidArgumentException('Conto non trovato.');
                }
            }
        }

        if ($paymentMethod === 'cash') {
            if ($accountId === null) {
                throw new InvalidArgumentException(
                    'Per i pagamenti in contanti devi selezionare un conto cassa.'
                );
            }
            if ($accountType !== 'cash') {
                throw new InvalidArgumentException(
                    'Il conto selezionato non e\' un conto cassa: scegli "In tasca" o un altro conto Contanti.'
                );
            }
        }

        $sharedWith = $sharedWith === null ? null : trim($sharedWith);
        if ($sharedWith === '') $sharedWith = null;
        if ($sharedWith !== null && mb_strlen($sharedWith) > 255) {
            throw new InvalidArgumentException('Lista "Condiviso con" troppo lunga.');
        }

        $shareNorm = null;
        if ($shareAmount !== null && $shareAmount !== '') {
            $shareF = is_string($shareAmount) ? (float) str_replace(',', '.', $shareAmount) : (float) $shareAmount;
            if ($shareF < 0.01) {
                throw new InvalidArgumentException('Quota personale non valida.');
            }
            if ($shareF > $amountF) {
                throw new InvalidArgumentException('La tua quota non puo\' superare il totale.');
            }
            $shareNorm = number_format($shareF, 2, '.', '');
        }

        return [
            'category_id'    => $categoryId,
            'contact_id'     => $contactId,
            'account_id'     => $accountId,
            'amount'         => number_format($amountF, 2, '.', ''),
            'description'    => $description,
            'shared_with'    => $sharedWith,
            'share_amount'   => $shareNorm,
            'payment_method' => $paymentMethod,
            'expense_date'   => $expenseDate,
        ];
    }

    private static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }
}
