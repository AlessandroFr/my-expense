<?php
declare(strict_types=1);

namespace App;

use DateTime;
use DateTimeImmutable;
use InvalidArgumentException;

final class RecurringExpense
{
    public const FREQUENCIES = ['weekly', 'monthly', 'yearly'];

    /** @return array<int, array<string,mixed>> */
    public static function listForUser(int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            "SELECT r.id, r.user_id, r.category_id, r.amount, r.description,
                    r.payment_method, r.frequency, r.start_date, r.end_date,
                    r.last_generated_date, r.active, r.created_at, r.updated_at,
                    c.name  AS category_name,
                    c.color AS category_color,
                    c.icon  AS category_icon
             FROM recurring_expenses r
             LEFT JOIN categories c ON c.id = r.category_id
             WHERE r.user_id = ?
             ORDER BY r.active DESC, r.frequency, r.description"
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT * FROM recurring_expenses WHERE id = ? AND user_id = ? LIMIT 1'
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
        string $frequency,
        string $startDate,
        ?string $endDate
    ): int {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $frequency, $startDate, $endDate);
        $stmt = Database::pdo()->prepare(
            'INSERT INTO recurring_expenses
                (user_id, category_id, amount, description, payment_method,
                 frequency, start_date, end_date, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
        );
        $stmt->execute([
            $userId, $row['category_id'], $row['amount'], $row['description'],
            $row['payment_method'], $row['frequency'], $row['start_date'], $row['end_date'],
        ]);
        return (int) Database::pdo()->lastInsertId();
    }

    public static function update(
        int $id,
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $frequency,
        string $startDate,
        ?string $endDate
    ): void {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $frequency, $startDate, $endDate);
        $stmt = Database::pdo()->prepare(
            'UPDATE recurring_expenses
             SET category_id = ?, amount = ?, description = ?, payment_method = ?,
                 frequency = ?, start_date = ?, end_date = ?
             WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([
            $row['category_id'], $row['amount'], $row['description'], $row['payment_method'],
            $row['frequency'], $row['start_date'], $row['end_date'], $id, $userId,
        ]);
    }

    public static function setActive(int $id, int $userId, bool $active): void
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE recurring_expenses SET active = ? WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$active ? 1 : 0, $id, $userId]);
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    /**
     * Genera tutte le occorrenze pendenti per l'utente, da `last_generated_date`+step
     * (o `start_date` se mai generata) fino a oggi. Inserisce in `expenses` e aggiorna
     * `last_generated_date`. Ritorna numero di occorrenze inserite.
     */
    public static function generatePending(int $userId): int
    {
        $today = new DateTimeImmutable(date('Y-m-d'));
        $pdo   = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT id, category_id, amount, description, payment_method, frequency,
                    start_date, end_date, last_generated_date
             FROM recurring_expenses
             WHERE user_id = ? AND active = 1'
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();

        $insertExpense = $pdo->prepare(
            'INSERT INTO expenses (user_id, category_id, amount, description, payment_method, expense_date)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $updateLast = $pdo->prepare(
            'UPDATE recurring_expenses SET last_generated_date = ? WHERE id = ? AND user_id = ?'
        );

        $created = 0;
        foreach ($rows as $r) {
            $cursor = self::nextOccurrence(
                $r['last_generated_date'] === null ? null : new DateTimeImmutable($r['last_generated_date']),
                new DateTimeImmutable($r['start_date']),
                (string) $r['frequency']
            );
            $endLimit = $r['end_date'] !== null
                ? new DateTimeImmutable($r['end_date'])
                : null;

            $lastDate = null;
            while ($cursor <= $today && ($endLimit === null || $cursor <= $endLimit)) {
                $insertExpense->execute([
                    $userId,
                    $r['category_id'],
                    $r['amount'],
                    $r['description'],
                    $r['payment_method'],
                    $cursor->format('Y-m-d'),
                ]);
                $created++;
                $lastDate = $cursor->format('Y-m-d');
                $cursor   = self::advance($cursor, (string) $r['frequency']);
            }
            if ($lastDate !== null) {
                $updateLast->execute([$lastDate, (int) $r['id'], $userId]);
            }
        }
        return $created;
    }

    private static function nextOccurrence(
        ?DateTimeImmutable $lastGenerated,
        DateTimeImmutable $start,
        string $frequency
    ): DateTimeImmutable {
        if ($lastGenerated === null) {
            return $start;
        }
        return self::advance($lastGenerated, $frequency);
    }

    private static function advance(DateTimeImmutable $d, string $frequency): DateTimeImmutable
    {
        return match ($frequency) {
            'weekly'  => $d->modify('+1 week'),
            'monthly' => $d->modify('+1 month'),
            'yearly'  => $d->modify('+1 year'),
            default   => throw new InvalidArgumentException('Frequenza non valida.'),
        };
    }

    /**
     * @return array{
     *   category_id:?int, amount:string, description:?string, payment_method:string,
     *   frequency:string, start_date:string, end_date:?string
     * }
     */
    private static function validate(
        int $userId,
        ?int $categoryId,
        string|float $amount,
        ?string $description,
        string $paymentMethod,
        string $frequency,
        string $startDate,
        ?string $endDate
    ): array {
        $amountF = is_string($amount) ? (float) str_replace(',', '.', $amount) : (float) $amount;
        if ($amountF < 0.01 || $amountF > 99999999.99) {
            throw new InvalidArgumentException('Importo non valido.');
        }
        if (!in_array($paymentMethod, Expense::PAYMENT_METHODS, true)) {
            throw new InvalidArgumentException('Metodo di pagamento non valido.');
        }
        if (!in_array($frequency, self::FREQUENCIES, true)) {
            throw new InvalidArgumentException('Frequenza non valida (weekly/monthly/yearly).');
        }
        if (!self::isValidDate($startDate)) {
            throw new InvalidArgumentException('Data inizio non valida.');
        }
        if ($endDate !== null && $endDate !== '') {
            if (!self::isValidDate($endDate)) {
                throw new InvalidArgumentException('Data fine non valida.');
            }
            if ($endDate < $startDate) {
                throw new InvalidArgumentException('La data fine deve essere successiva alla data inizio.');
            }
        } else {
            $endDate = null;
        }

        $description = $description === null ? null : trim($description);
        if ($description === '') $description = null;
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

        return [
            'category_id'    => $categoryId,
            'amount'         => number_format($amountF, 2, '.', ''),
            'description'    => $description,
            'payment_method' => $paymentMethod,
            'frequency'      => $frequency,
            'start_date'     => $startDate,
            'end_date'       => $endDate,
        ];
    }

    private static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }
}
