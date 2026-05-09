<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Http\HttpException;
use App\Models\Entities\Budget;
use App\Models\Repositories\BudgetRepository;

/**
 * Service per i budget mensili. Validazioni shape (year_month, amount) e
 * regola di ownership (category appartiene allo user).
 */
final class BudgetService extends BaseService
{
    public function __construct(
        private readonly BudgetRepository $repo = new BudgetRepository(),
    ) {
    }

    public function repository(): BudgetRepository
    {
        return $this->repo;
    }

    /**
     * @return list<Budget>
     */
    public function progressForMonth(int $userId, string $yearMonth): array
    {
        $this->assertYearMonth($yearMonth);
        return $this->repo->progressForMonth($userId, $yearMonth);
    }

    public function setForMonth(int $userId, int $categoryId, string $yearMonth, string|float $amount): void
    {
        $this->assertYearMonth($yearMonth);

        $amountF = is_string($amount) ? (float) str_replace(',', '.', $amount) : (float) $amount;
        if ($amountF < 0.01) {
            throw HttpException::badRequest('Importo non valido (minimo 0.01).');
        }
        if ($amountF > 99999999.99) {
            throw HttpException::badRequest('Importo troppo grande.');
        }

        $check = Database::pdo()->prepare('SELECT 1 FROM categories WHERE id = ? AND user_id = ? LIMIT 1');
        $check->execute([$categoryId, $userId]);
        if ($check->fetchColumn() === false) {
            throw HttpException::badRequest('Categoria non trovata.');
        }

        $this->repo->setForMonth($userId, $categoryId, $yearMonth, number_format($amountF, 2, '.', ''));
    }

    public function deleteForMonth(int $userId, int $categoryId, string $yearMonth): void
    {
        $this->assertYearMonth($yearMonth);
        $this->repo->deleteForMonth($userId, $categoryId, $yearMonth);
    }

    public function checkForCategory(int $userId, ?int $categoryId, string $yearMonth): ?Budget
    {
        if ($categoryId === null || !$this->isValidYearMonth($yearMonth)) {
            return null;
        }
        return $this->repo->checkForCategory($userId, $categoryId, $yearMonth);
    }

    private function assertYearMonth(string $ym): void
    {
        if (!$this->isValidYearMonth($ym)) {
            throw HttpException::badRequest('Mese non valido (formato YYYY-MM).');
        }
    }

    private function isValidYearMonth(string $ym): bool
    {
        return (bool) preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym);
    }
}
