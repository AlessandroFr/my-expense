<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Database;
use App\Models\Entities\BaseEntity;
use PDO;
use PDOStatement;

/**
 * Classe base per Repository. Wrappa l'accesso a PDO via Database::pdo().
 *
 * Le sottoclassi tipicamente:
 *   - dichiarano la $table di riferimento
 *   - dichiarano la classe Entity associata in $entityClass
 *   - implementano query specifiche di dominio (list, aggregates, ecc.)
 *
 * Esempio:
 *   final class ExpenseRepository extends BaseRepository {
 *     protected string $table = 'expenses';
 *     protected string $entityClass = Expense::class;
 *
 *     public function findById(int $id, int $userId): ?Expense {
 *       $row = $this->fetchOne('SELECT * FROM expenses WHERE id=? AND user_id=?', [$id, $userId]);
 *       return $row ? Expense::fromRow($row) : null;
 *     }
 *   }
 */
abstract class BaseRepository
{
    protected string $table = '';

    /** @var class-string<BaseEntity>|'' */
    protected string $entityClass = '';

    protected function pdo(): PDO
    {
        return Database::pdo();
    }

    /**
     * @param array<int|string, mixed> $params
     */
    protected function exec(string $sql, array $params = []): PDOStatement
    {
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /**
     * @param array<int|string, mixed> $params
     * @return array<string, mixed>|null
     */
    protected function fetchOne(string $sql, array $params = []): ?array
    {
        $row = $this->exec($sql, $params)->fetch(PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }

    /**
     * @param array<int|string, mixed> $params
     * @return list<array<string, mixed>>
     */
    protected function fetchAll(string $sql, array $params = []): array
    {
        $rows = $this->exec($sql, $params)->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? array_values($rows) : [];
    }

    /**
     * @param array<int|string, mixed> $params
     */
    protected function fetchScalar(string $sql, array $params = []): mixed
    {
        return $this->exec($sql, $params)->fetchColumn();
    }

    /**
     * Insert generico. Restituisce il lastInsertId.
     *
     * @param array<string, mixed> $data
     */
    protected function insert(array $data): int
    {
        $cols   = array_keys($data);
        $params = array_values($data);
        $place  = implode(', ', array_fill(0, count($cols), '?'));
        $sql = sprintf(
            'INSERT INTO `%s` (`%s`) VALUES (%s)',
            $this->table,
            implode('`, `', $cols),
            $place,
        );
        $this->exec($sql, $params);
        return (int) $this->pdo()->lastInsertId();
    }

    /**
     * Update generico per (id, scope). Restituisce il numero di righe affette.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $scope  e.g. ['user_id' => 5]
     */
    protected function update(int $id, array $data, array $scope = []): int
    {
        if ($data === []) {
            return 0;
        }
        $set = [];
        $params = [];
        foreach ($data as $col => $val) {
            $set[]    = "`{$col}` = ?";
            $params[] = $val;
        }
        $where = ['`id` = ?'];
        $params[] = $id;
        foreach ($scope as $col => $val) {
            $where[]  = "`{$col}` = ?";
            $params[] = $val;
        }
        $sql = sprintf(
            'UPDATE `%s` SET %s WHERE %s',
            $this->table,
            implode(', ', $set),
            implode(' AND ', $where),
        );
        return $this->exec($sql, $params)->rowCount();
    }

    /**
     * Delete generico per (id, scope). Restituisce il numero di righe affette.
     *
     * @param array<string, mixed> $scope
     */
    protected function delete(int $id, array $scope = []): int
    {
        $where  = ['`id` = ?'];
        $params = [$id];
        foreach ($scope as $col => $val) {
            $where[]  = "`{$col}` = ?";
            $params[] = $val;
        }
        $sql = sprintf(
            'DELETE FROM `%s` WHERE %s',
            $this->table,
            implode(' AND ', $where),
        );
        return $this->exec($sql, $params)->rowCount();
    }
}
