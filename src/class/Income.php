<?php
declare(strict_types=1);

namespace App;

use DateTime;
use InvalidArgumentException;
use PDOException;

final class Income
{
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
        ?int $contactId = null,
        ?int $transferId = null
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
                                      payment_method, income_date, value_date, import_hash,
                                      is_transfer, transfer_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId, $accountId, $contactId, $row['source'], $row['description'], $row['amount'],
                $payment, $row['income_date'], $valueDate, $importHash,
                $transferId !== null ? 1 : 0,
                $transferId,
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
