<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Services\SavedFilterService;

/**
 * Controller dei filtri salvati. Sostituisce filters_list/save/delete.php.
 */
final class FilterController extends BaseController
{
    private SavedFilterService $service;

    public function __construct(?SavedFilterService $service = null)
    {
        $this->service = $service ?? new SavedFilterService();
    }

    /** GET /filters/list?scope=expenses */
    public function list(Request $request): Response
    {
        $userId = $this->userId();
        $scope  = (string) ($request->query('scope') ?? 'expenses');
        $filters = array_map(
            static fn($f): array => $f->toArray(),
            $this->service->listForUser($userId, $scope),
        );
        return $this->json(['filters' => $filters]);
    }

    /** POST /filters/save -- name, scope, payload (string JSON o array) */
    public function save(Request $request): Response
    {
        $userId  = $this->userId();
        $name    = (string) ($request->input('name')  ?? '');
        $scope   = (string) ($request->input('scope') ?? 'expenses');
        $payload = $request->input('payload') ?? null;

        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            $payload = is_array($decoded) ? $decoded : [];
        } elseif (!is_array($payload)) {
            $payload = [];
        }

        $id = $this->service->save($userId, $scope, $name, $payload);
        return $this->json(['id' => $id]);
    }

    /** POST /filters/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID filtro mancante.');
        }
        $this->service->delete($id, $userId);
        return $this->json(['deleted' => true]);
    }
}
