<?php
declare(strict_types=1);

namespace App;

use DateTime;
use InvalidArgumentException;
use PDOException;

final class Expense
{
    public const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

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
        ?int $contactId = null,
        ?int $transferId = null
    ): ?int {
        $row = self::validate($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate, $accountId, null, null, $contactId);
        if ($valueDate !== null && !self::isValidDate($valueDate)) {
            throw new InvalidArgumentException('Data valuta non valida.');
        }

        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO expenses (user_id, category_id, contact_id, account_id, amount, description,
                                       payment_method, expense_date, value_date, import_hash,
                                       is_transfer, transfer_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
                $transferId !== null ? 1 : 0,
                $transferId,
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
