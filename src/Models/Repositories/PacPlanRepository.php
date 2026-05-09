<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\PacPlan;

/**
 * Repository per i piani PAC. Le query di list() includono i join su
 * accounts (account_name + source_account_name), pac_funds (fund_name) e
 * asset_classes (asset_class_name/color).
 */
final class PacPlanRepository extends BaseRepository
{
    protected string $table = 'pac_plans';

    /** @var class-string<PacPlan> */
    protected string $entityClass = PacPlan::class;

    /** @return list<PacPlan> */
    public function listForUser(int $userId, bool $onlyActive = false): array
    {
        $whereActive = $onlyActive ? ' AND p.active = 1' : '';
        $rows = $this->fetchAll(
            "SELECT p.id, p.user_id, p.account_id, p.source_account_id, p.fund_id,
                    p.name, p.frequency, p.amount, p.start_date, p.end_date,
                    p.last_generated_date, p.beneficiary_iban, p.beneficiary_keyword,
                    p.active, p.notes, p.created_at, p.updated_at,
                    a.name  AS account_name,
                    sa.name AS source_account_name,
                    f.name  AS fund_name,
                    ac.name  AS asset_class_name,
                    ac.color AS asset_class_color
             FROM pac_plans p
             INNER JOIN accounts a   ON a.id  = p.account_id
             LEFT  JOIN accounts sa  ON sa.id = p.source_account_id
             INNER JOIN pac_funds f  ON f.id  = p.fund_id
             LEFT  JOIN asset_classes ac ON ac.id = f.asset_class_id
             WHERE p.user_id = ?{$whereActive}
             ORDER BY p.active DESC, p.name ASC",
            [$userId],
        );
        return array_map(static fn(array $r): PacPlan => PacPlan::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?PacPlan
    {
        $row = $this->fetchOne(
            "SELECT p.id, p.user_id, p.account_id, p.source_account_id, p.fund_id,
                    p.name, p.frequency, p.amount, p.start_date, p.end_date,
                    p.last_generated_date, p.beneficiary_iban, p.beneficiary_keyword,
                    p.active, p.notes, p.created_at, p.updated_at,
                    a.name  AS account_name,
                    sa.name AS source_account_name,
                    f.name  AS fund_name,
                    ac.name  AS asset_class_name,
                    ac.color AS asset_class_color
             FROM pac_plans p
             INNER JOIN accounts a   ON a.id  = p.account_id
             LEFT  JOIN accounts sa  ON sa.id = p.source_account_id
             INNER JOIN pac_funds f  ON f.id  = p.fund_id
             LEFT  JOIN asset_classes ac ON ac.id = f.asset_class_id
             WHERE p.id = ? AND p.user_id = ? LIMIT 1",
            [$id, $userId],
        );
        return $row !== null ? PacPlan::fromRow($row) : null;
    }

    /** @return list<PacPlan> */
    public function activeForUser(int $userId): array
    {
        return $this->listForUser($userId, true);
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        return $this->insert($data);
    }

    /** @param array<string, mixed> $data */
    public function updateForUser(int $id, int $userId, array $data): int
    {
        return $this->update($id, $data, ['user_id' => $userId]);
    }

    public function deleteForUser(int $id, int $userId): int
    {
        return $this->delete($id, ['user_id' => $userId]);
    }

    public function setLastGeneratedDate(int $id, int $userId, string $date): void
    {
        $this->exec(
            'UPDATE pac_plans SET last_generated_date = ? WHERE id = ? AND user_id = ?',
            [$date, $id, $userId],
        );
    }
}
