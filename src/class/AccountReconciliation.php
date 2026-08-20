<?php
declare(strict_types=1);

namespace App;

use App\Services\CategoryService;
use DateTime;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

/**
 * Riconciliazione conti.
 *
 * L'utente dichiara il saldo reale di un conto a una data e il sistema
 * calcola la differenza rispetto a `Account::balanceFor()`. Se la
 * differenza non e' zero genera un movimento di rettifica (Expense
 * categoria "Rettifica" se il sistema ha piu' soldi del reale; Income
 * source "Rettifica" se ne ha meno) datato al giorno della
 * riconciliazione e collegato al record qui salvato.
 *
 * Lo storico viene mantenuto anche per le riconciliazioni a differenza
 * zero, cosi' l'utente sa "ultima volta che ho verificato il conto era
 * allineato il giorno X".
 */
final class AccountReconciliation
{
    private const ADJUSTMENT_LABEL = 'Rettifica';

    /**
     * @return array<string,mixed> riga inserita arricchita con info conto e movimento.
     */
    public static function reconcile(
        int $userId,
        int $accountId,
        string $declaredBalance,
        string $reconciledAt,
        ?string $notes
    ): array {
        $account = Account::findForUser($accountId, $userId);
        if ($account === null) {
            throw new InvalidArgumentException('Conto non trovato.');
        }

        $declared = self::parseAmount($declaredBalance);
        if ($declared === null) {
            throw new InvalidArgumentException('Saldo dichiarato non valido.');
        }

        if (!self::isValidDate($reconciledAt)) {
            throw new InvalidArgumentException('Data riconciliazione non valida (formato YYYY-MM-DD).');
        }
        if ($reconciledAt > date('Y-m-d')) {
            throw new InvalidArgumentException('La data di riconciliazione non puo\' essere futura.');
        }

        $notes = $notes === null ? null : trim($notes);
        if ($notes === '') $notes = null;
        if ($notes !== null && mb_strlen($notes) > 255) {
            throw new InvalidArgumentException('Note troppo lunghe (max 255 caratteri).');
        }

        $calculated = Account::balanceFor($userId, $accountId);
        $difference = round($declared - $calculated, 2);

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $adjustmentType      = 'none';
            $adjustmentExpenseId = null;
            $adjustmentIncomeId  = null;

            $movementDescription = self::buildDescription($notes);

            if ($difference > 0.0) {
                $adjustmentIncomeId = Income::create(
                    $userId,
                    self::ADJUSTMENT_LABEL,
                    $movementDescription,
                    number_format(abs($difference), 2, '.', ''),
                    $reconciledAt,
                    $accountId
                );
                $adjustmentType = 'income';
            } elseif ($difference < 0.0) {
                $categoryId = (new CategoryService())->findOrCreateByName(
                    $userId,
                    self::ADJUSTMENT_LABEL,
                    '#6c757d',
                    'arrow-repeat'
                )->id;
                $adjustmentExpenseId = Expense::create(
                    $userId,
                    $categoryId,
                    number_format(abs($difference), 2, '.', ''),
                    $movementDescription,
                    'other',
                    $reconciledAt,
                    $accountId
                );
                $adjustmentType = 'expense';
            }

            $stmt = $pdo->prepare(
                'INSERT INTO account_reconciliations
                    (user_id, account_id, reconciled_at,
                     declared_balance, calculated_balance, difference,
                     adjustment_type, adjustment_expense_id, adjustment_income_id, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId,
                $accountId,
                $reconciledAt,
                number_format($declared,   2, '.', ''),
                number_format($calculated, 2, '.', ''),
                number_format($difference, 2, '.', ''),
                $adjustmentType,
                $adjustmentExpenseId,
                $adjustmentIncomeId,
                $notes,
            ]);
            $newId = (int) $pdo->lastInsertId();
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return [
            'id'                    => $newId,
            'user_id'               => $userId,
            'account_id'            => $accountId,
            'reconciled_at'         => $reconciledAt,
            'declared_balance'      => round($declared, 2),
            'calculated_balance'    => round($calculated, 2),
            'difference'            => round($difference, 2),
            'adjustment_type'       => $adjustmentType,
            'adjustment_expense_id' => $adjustmentExpenseId,
            'adjustment_income_id'  => $adjustmentIncomeId,
            'notes'                 => $notes,
        ];
    }

    /**
     * Storico riconciliazioni di un conto, dalla piu' recente alla piu' vecchia.
     * Include la descrizione del movimento di rettifica via LEFT JOIN, cosi'
     * la UI puo' segnalare se e' stato cancellato manualmente (NULL).
     *
     * @return array<int, array<string,mixed>>
     */
    public static function listForAccount(int $userId, int $accountId, int $limit = 50): array
    {
        $limit = max(1, min(500, $limit));
        $stmt = Database::pdo()->prepare(
            "SELECT r.id, r.account_id, r.reconciled_at,
                    r.declared_balance, r.calculated_balance, r.difference,
                    r.adjustment_type, r.adjustment_expense_id, r.adjustment_income_id,
                    r.notes, r.created_at,
                    e.description AS expense_description,
                    i.description AS income_description,
                    e.amount      AS expense_amount,
                    i.amount      AS income_amount
             FROM account_reconciliations r
             LEFT JOIN expenses e ON e.id = r.adjustment_expense_id
             LEFT JOIN incomes  i ON i.id = r.adjustment_income_id
             WHERE r.user_id = ? AND r.account_id = ?
             ORDER BY r.reconciled_at DESC, r.id DESC
             LIMIT {$limit}"
        );
        $stmt->execute([$userId, $accountId]);
        return $stmt->fetchAll();
    }

    /**
     * Rimuove la riga di storico ma NON cancella il movimento di
     * rettifica gia' generato (e' ormai un dato contabile a se' stante,
     * l'utente puo' eliminarlo manualmente da /expenses o /incomes).
     */
    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id FROM account_reconciliations
             WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        if ($stmt->fetchColumn() === false) {
            throw new RuntimeException('Riconciliazione non trovata.');
        }

        $stmt = Database::pdo()->prepare(
            'DELETE FROM account_reconciliations WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    private static function buildDescription(?string $notes): string
    {
        $base = 'Rettifica da riconciliazione';
        if ($notes !== null && $notes !== '') {
            return $base . ' — ' . $notes;
        }
        return $base;
    }

    private static function parseAmount(string $raw): ?float
    {
        $raw = trim($raw);
        if ($raw === '') return null;
        $normalized = str_replace(',', '.', $raw);
        if (!is_numeric($normalized)) return null;
        $value = (float) $normalized;
        if ($value < -99999999.99 || $value > 99999999.99) return null;
        return $value;
    }

    private static function isValidDate(string $date): bool
    {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d !== false && $d->format('Y-m-d') === $date;
    }
}
