<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDO;
use Throwable;

/**
 * Reset distruttivo dei dati di un utente, scoped sul user_id corrente.
 *
 * Ambiti supportati:
 *  - 'movements'           → cancella expenses, incomes, expense_tags, expense_attachments + file su disco
 *  - 'movements_recurring' → come 'movements' + azzera last_generated_date sui template ricorrenti
 *  - 'all'                 → tabula rasa di tutte le 11 tabelle user-scoped (l'utente NON viene mai cancellato)
 *
 * Le delete passano per una transazione singola con FOREIGN_KEY_CHECKS=0
 * per essere indipendenti dall'ordine FK; la pulizia del filesystem
 * (uploads/expenses/{user_id}/) è best-effort dopo il commit.
 */
final class DatabaseReset
{
    public const SCOPE_MOVEMENTS           = 'movements';
    public const SCOPE_MOVEMENTS_RECURRING = 'movements_recurring';
    public const SCOPE_ALL                 = 'all';

    public const ALLOWED_SCOPES = [
        self::SCOPE_MOVEMENTS,
        self::SCOPE_MOVEMENTS_RECURRING,
        self::SCOPE_ALL,
    ];

    /**
     * Esegue il reset. Tutti i contatori sono inizializzati a 0; quelli
     * non rilevanti per lo scope scelto restano a 0.
     *
     * @return array<string,int>
     */
    public static function execute(int $userId, string $scope): array
    {
        if ($userId <= 0) {
            throw new InvalidArgumentException('User ID non valido.');
        }
        if (!in_array($scope, self::ALLOWED_SCOPES, true)) {
            throw new InvalidArgumentException('Scope non valido.');
        }

        $pdo = Database::pdo();

        $counters = [
            'expense_attachments_deleted' => 0,
            'expense_tags_deleted'        => 0,
            'expenses_deleted'            => 0,
            'incomes_deleted'             => 0,
            'recurring_reset'             => 0,
            'recurring_deleted'           => 0,
            'budgets_deleted'             => 0,
            'saved_filters_deleted'       => 0,
            'tags_deleted'                => 0,
            'accounts_deleted'            => 0,
            'contacts_deleted'            => 0,
            'categories_deleted'          => 0,
            'attachment_files_deleted'    => 0,
        ];

        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        $pdo->beginTransaction();

        try {
            // ── Movimenti (in tutti gli scope) ───────────────────────────
            $counters['expense_attachments_deleted'] = self::deleteByUser($pdo, 'expense_attachments', $userId);

            $stmt = $pdo->prepare(
                'DELETE et FROM expense_tags et
                 INNER JOIN expenses e ON e.id = et.expense_id
                 WHERE e.user_id = ?'
            );
            $stmt->execute([$userId]);
            $counters['expense_tags_deleted'] = $stmt->rowCount();

            $counters['expenses_deleted'] = self::deleteByUser($pdo, 'expenses', $userId);
            $counters['incomes_deleted']  = self::deleteByUser($pdo, 'incomes',  $userId);

            // ── Reset cronologia ricorrenti (scope movements_recurring) ──
            if ($scope === self::SCOPE_MOVEMENTS_RECURRING) {
                $stmt = $pdo->prepare(
                    'UPDATE recurring_expenses SET last_generated_date = NULL WHERE user_id = ?'
                );
                $stmt->execute([$userId]);
                $counters['recurring_reset'] = $stmt->rowCount();
            }

            // ── Tabula rasa (scope all) ─────────────────────────────────
            if ($scope === self::SCOPE_ALL) {
                $counters['saved_filters_deleted'] = self::deleteByUser($pdo, 'saved_filters',      $userId);
                $counters['budgets_deleted']       = self::deleteByUser($pdo, 'budgets',            $userId);
                $counters['recurring_deleted']     = self::deleteByUser($pdo, 'recurring_expenses', $userId);
                $counters['tags_deleted']          = self::deleteByUser($pdo, 'tags',               $userId);
                $counters['accounts_deleted']      = self::deleteByUser($pdo, 'accounts',           $userId);
                $counters['contacts_deleted']      = self::deleteByUser($pdo, 'contacts',           $userId);
                $counters['categories_deleted']    = self::deleteByUser($pdo, 'categories',         $userId);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
            throw $e;
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');

        // ── Filesystem: uploads/expenses/{user_id}/ ──────────────────────
        // Best-effort: i record DB sono già spariti, eventuali file orfani
        // non rompono nulla ma vengono comunque puliti per liberare spazio.
        $counters['attachment_files_deleted'] = self::purgeUserUploads($userId);

        return $counters;
    }

    private static function deleteByUser(PDO $pdo, string $table, int $userId): int
    {
        $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE user_id = ?");
        $stmt->execute([$userId]);
        return $stmt->rowCount();
    }

    private static function purgeUserUploads(int $userId): int
    {
        $dir = Attachment::uploadsRoot() . DIRECTORY_SEPARATOR . $userId;
        if (!is_dir($dir)) {
            return 0;
        }

        $deleted = 0;
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iter as $node) {
            if ($node->isFile() || $node->isLink()) {
                if (@unlink($node->getPathname())) {
                    $deleted++;
                }
            } elseif ($node->isDir()) {
                @rmdir($node->getPathname());
            }
        }
        @rmdir($dir);

        return $deleted;
    }
}
