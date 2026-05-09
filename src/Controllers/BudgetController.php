<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Models\Entities\Budget;
use App\Services\BudgetService;
use App\Services\CategoryService;

/**
 * Controller dei Budget mensili. Sostituisce budgets_list/set/delete.php +
 * la pagina budgets.php.
 */
final class BudgetController extends BaseController
{
    private BudgetService $service;
    private CategoryService $categories;

    public function __construct(?BudgetService $service = null, ?CategoryService $categories = null)
    {
        $this->service    = $service    ?? new BudgetService();
        $this->categories = $categories ?? new CategoryService();
    }

    /** GET /budgets -- pagina HTML con month picker + lista cards. */
    public function index(Request $request): Response
    {
        return $this->view('budgets.index', [
            'title'        => 'Budget mensili',
            'currentMonth' => date('Y-m'),
        ]);
    }

    /** GET /budgets/list?month=YYYY-MM -- JSON envelope. */
    public function list(Request $request): Response
    {
        $userId = $this->userId();
        $ym     = (string) ($request->query('month') ?? date('Y-m'));

        $budgets = array_map(
            static fn(Budget $b): array => $b->toArray(),
            $this->service->progressForMonth($userId, $ym),
        );
        $categories = array_map(
            static fn($c): array => $c->toArray(),
            $this->categories->repository()->listForUser($userId),
        );

        return $this->json([
            'month'      => $ym,
            'budgets'    => $budgets,
            'categories' => $categories,
        ]);
    }

    /** POST /budgets/set */
    public function set(Request $request): Response
    {
        $userId     = $this->userId();
        $categoryId = (int) ($request->input('category_id') ?? 0);
        $ym         = trim((string) ($request->input('month') ?? ''));
        $amount     = (string) ($request->input('amount') ?? '');

        if ($categoryId <= 0) {
            throw HttpException::badRequest('Categoria mancante.');
        }
        $this->service->setForMonth($userId, $categoryId, $ym, $amount);
        return $this->json(['saved' => true]);
    }

    /** POST /budgets/delete */
    public function delete(Request $request): Response
    {
        $userId     = $this->userId();
        $categoryId = (int) ($request->input('category_id') ?? 0);
        $ym         = trim((string) ($request->input('month') ?? ''));
        if ($categoryId <= 0) {
            throw HttpException::badRequest('Categoria mancante.');
        }
        $this->service->deleteForMonth($userId, $categoryId, $ym);
        return $this->json(['deleted' => true]);
    }
}
