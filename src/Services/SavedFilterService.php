<?php
declare(strict_types=1);

namespace App\Services;

use App\Http\HttpException;
use App\Models\Entities\SavedFilter;
use App\Models\Repositories\SavedFilterRepository;

/**
 * Service per i filtri salvati.
 */
final class SavedFilterService extends BaseService
{
    public function __construct(
        private readonly SavedFilterRepository $repo = new SavedFilterRepository(),
    ) {
    }

    public function repository(): SavedFilterRepository
    {
        return $this->repo;
    }

    /**
     * @return list<SavedFilter>
     */
    public function listForUser(int $userId, string $scope = 'expenses'): array
    {
        return $this->repo->listForUser($userId, $scope);
    }

    /**
     * @param array<string,mixed> $payload
     */
    public function save(int $userId, string $scope, string $name, array $payload): int
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 64) {
            throw HttpException::badRequest('Nome filtro obbligatorio (max 64 caratteri).');
        }
        $scope = trim($scope) === '' ? 'expenses' : $scope;
        if (mb_strlen($scope) > 32) {
            throw HttpException::badRequest('Scope troppo lungo.');
        }
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw HttpException::badRequest('Impossibile serializzare i filtri.');
        }
        return $this->repo->save($userId, $scope, $name, $json);
    }

    public function delete(int $id, int $userId): void
    {
        $this->repo->deleteForUser($id, $userId);
    }
}
