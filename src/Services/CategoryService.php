<?php
declare(strict_types=1);

namespace App\Services;

use App\Http\HttpException;
use App\Models\Entities\Category;
use App\Models\Repositories\CategoryRepository;
use PDOException;

/**
 * Service per le categorie. Applica le regole shape (name range, color hex,
 * icon max length) e gestisce il conflict UNIQUE su (user_id, name).
 */
final class CategoryService extends BaseService
{
    public function __construct(
        private readonly CategoryRepository $repo = new CategoryRepository(),
    ) {
    }

    public function repository(): CategoryRepository
    {
        return $this->repo;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(int $userId, array $data): Category
    {
        $row = $this->normalize($data);
        try {
            $id = $this->repo->create([
                'user_id'    => $userId,
                'name'       => $row['name'],
                'color'      => $row['color'],
                'icon'       => $row['icon'],
                'sort_order' => $row['sort_order'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw HttpException::conflict("Esiste gia' una categoria con il nome '{$row['name']}'.");
            }
            throw $e;
        }
        $entity = $this->repo->findById($id, $userId);
        if ($entity === null) {
            throw HttpException::notFound('Categoria non trovata dopo la creazione.');
        }
        return $entity;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, int $userId, array $data): Category
    {
        if ($this->repo->findById($id, $userId) === null) {
            throw HttpException::notFound('Categoria non trovata.');
        }
        $row = $this->normalize($data);
        try {
            $this->repo->updateForUser($id, $userId, [
                'name'       => $row['name'],
                'color'      => $row['color'],
                'icon'       => $row['icon'],
                'sort_order' => $row['sort_order'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw HttpException::conflict("Esiste gia' una categoria con il nome '{$row['name']}'.");
            }
            throw $e;
        }
        $entity = $this->repo->findById($id, $userId);
        if ($entity === null) {
            throw HttpException::notFound('Categoria non trovata dopo l\'aggiornamento.');
        }
        return $entity;
    }

    public function delete(int $id, int $userId): void
    {
        $this->repo->deleteForUser($id, $userId);
    }

    /**
     * Lookup by name (case-insensitive); se non esiste la crea con i parametri
     * di default. Usata per le categorie di sistema (es. "Rettifica" dal modulo
     * di riconciliazione conti).
     */
    public function findOrCreateByName(int $userId, string $name, string $color = '#6c757d', ?string $icon = 'arrow-repeat'): Category
    {
        $existing = $this->repo->findByNameForUser($userId, trim($name));
        if ($existing !== null) {
            return $existing;
        }
        return $this->create($userId, [
            'name'       => $name,
            'color'      => $color,
            'icon'       => $icon,
            'sort_order' => 100,
        ]);
    }

    /**
     * @param array<string, mixed> $data
     * @return array{name:string, color:string, icon:?string, sort_order:int}
     */
    private function normalize(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 64) {
            throw HttpException::badRequest("Il nome e' obbligatorio (max 64 caratteri).");
        }

        $color = trim((string) ($data['color'] ?? '#6c757d'));
        if ($color === '') {
            $color = '#6c757d';
        }
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw HttpException::badRequest('Colore non valido. Usa un hex tipo #0d6efd.');
        }
        $color = strtolower($color);

        $icon = $data['icon'] ?? null;
        if ($icon !== null) {
            $icon = trim((string) $icon);
            if ($icon === '') {
                $icon = null;
            } elseif (mb_strlen($icon) > 32) {
                throw HttpException::badRequest('Nome icona troppo lungo (max 32 caratteri).');
            }
        }

        $sortOrder = (int) ($data['sort_order'] ?? 0);

        return ['name' => $name, 'color' => $color, 'icon' => $icon, 'sort_order' => $sortOrder];
    }
}
