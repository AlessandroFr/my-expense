<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Services\TagService;

/**
 * Controller dei tag. Sostituisce tags_list/assign/delete.php.
 */
final class TagController extends BaseController
{
    private TagService $service;

    public function __construct(?TagService $service = null)
    {
        $this->service = $service ?? new TagService();
    }

    /** GET /tags/list -- elenco tag dell'utente con use count. */
    public function list(Request $request): Response
    {
        $userId = $this->userId();
        $tags = array_map(
            static fn($t): array => $t->toArray(),
            $this->service->listForUser($userId),
        );
        return $this->json(['tags' => $tags]);
    }

    /** POST /tags/assign -- imposta i tag di una spesa (CSV o array). */
    public function assign(Request $request): Response
    {
        $userId    = $this->userId();
        $expenseId = (int) ($request->input('expense_id') ?? 0);
        if ($expenseId <= 0) {
            throw HttpException::badRequest('ID spesa mancante.');
        }
        $names = $request->input('names', '');
        $tags  = $this->service->setForExpense($expenseId, $userId, $names);
        return $this->json(['tags' => $tags]);
    }

    /** POST /tags/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID tag mancante.');
        }
        $this->service->delete($id, $userId);
        return $this->json(['deleted' => true]);
    }
}
