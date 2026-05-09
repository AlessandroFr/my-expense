<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Services\CategoryService;
use App\Validation\Requests\CreateCategoryRequest;
use App\Validation\Requests\UpdateCategoryRequest;

/**
 * Controller delle Categorie. Sostituisce categorie_create/update/delete.php
 * + le pagine categories.php e category_edit.php.
 */
final class CategoryController extends BaseController
{
    private CategoryService $service;

    public function __construct(?CategoryService $service = null)
    {
        $this->service = $service ?? new CategoryService();
    }

    /** GET /categories -- pagina HTML lista categorie + form inline. */
    public function index(Request $request): Response
    {
        $userId     = $this->userId();
        $categories = array_map(
            static fn($c): array => $c->toArray(),
            $this->service->repository()->listForUser($userId),
        );
        return $this->view('categories.index', [
            'title'      => 'Categorie',
            'categories' => $categories,
        ]);
    }

    /** GET /categories/edit?id=N -- pagina HTML modifica categoria. */
    public function edit(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->query('id') ?? 0);
        $cat    = $this->service->repository()->findById($id, $userId);
        return $this->view('categories.edit', [
            'title'    => 'Modifica categoria',
            'category' => $cat?->toArray(),
        ]);
    }

    /** POST /categories/create */
    public function create(Request $request): Response
    {
        $userId = $this->userId();
        $clean  = $this->validated(CreateCategoryRequest::class, $request);
        $entity = $this->service->create($userId, $clean);
        return $this->json(['category' => $entity->toArray()]);
    }

    /** POST /categories/update */
    public function update(Request $request): Response
    {
        $userId = $this->userId();
        $clean  = $this->validated(UpdateCategoryRequest::class, $request);
        $entity = $this->service->update((int) $clean['id'], $userId, $clean);
        return $this->json(['category' => $entity->toArray()]);
    }

    /** POST /categories/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID categoria mancante.');
        }
        $this->service->delete($id, $userId);
        return $this->json(['id' => $id]);
    }
}
