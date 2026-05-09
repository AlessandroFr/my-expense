<?php
declare(strict_types=1);

namespace App\Services;

use App\Http\HttpException;
use App\Models\Entities\Tag;
use App\Models\Repositories\TagRepository;
use InvalidArgumentException;

/**
 * Service per i tag.
 */
final class TagService extends BaseService
{
    public function __construct(
        private readonly TagRepository $repo = new TagRepository(),
    ) {
    }

    public function repository(): TagRepository
    {
        return $this->repo;
    }

    /**
     * @return list<Tag>
     */
    public function listForUser(int $userId): array
    {
        return $this->repo->listForUser($userId);
    }

    public function delete(int $id, int $userId): void
    {
        $this->repo->deleteForUser($id, $userId);
    }

    /**
     * @param array<int,string>|string $names CSV o array
     * @return list<array{id:int,name:string,color:string}>
     */
    public function setForExpense(int $expenseId, int $userId, string|array $names): array
    {
        $list = is_string($names)
            ? array_filter(array_map('trim', explode(',', $names)))
            : (is_array($names) ? $names : []);

        try {
            $this->repo->setForExpense($expenseId, $userId, $list);
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        return $this->repo->withColorsForExpense($expenseId, $userId);
    }
}
