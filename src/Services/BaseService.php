<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use Closure;
use Throwable;

/**
 * Classe base per i Service. I Service orchestrano operazioni cross-entity
 * (es. ExpenseService::create() chiama BudgetService::checkForCategory dopo
 * l'insert) e applicano regole di business non esprimibili come rules dichiarative.
 *
 * Le sottoclassi tipicamente ricevono i Repository via costruttore.
 */
abstract class BaseService
{
    /**
     * Esegue $callback in una transazione MySQL, con rollback automatico in caso
     * di Throwable. Se siamo gia' dentro una transazione (chiamata nested), non
     * apre/chiude — delega al chiamante esterno.
     *
     * @template T
     * @param Closure(): T $callback
     * @return T
     */
    protected function transactional(Closure $callback): mixed
    {
        $pdo = Database::pdo();
        $alreadyInTx = $pdo->inTransaction();
        if (!$alreadyInTx) {
            $pdo->beginTransaction();
        }
        try {
            $result = $callback();
            if (!$alreadyInTx) {
                $pdo->commit();
            }
            return $result;
        } catch (Throwable $e) {
            if (!$alreadyInTx && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
