<?php
declare(strict_types=1);

namespace App\Models\Repositories;

use App\Models\Entities\PacFund;

/**
 * Repository per i fondi PAC + storico NAV.
 *
 * Le query di list() includono il join su asset_classes e l'ultimo NAV via
 * subquery correlata (last_nav, last_nav_date) per dashboard/UI.
 */
final class PacFundRepository extends BaseRepository
{
    protected string $table = 'pac_funds';

    /** @var class-string<PacFund> */
    protected string $entityClass = PacFund::class;

    /** @return list<PacFund> */
    public function listForUser(int $userId, bool $includeArchived = false): array
    {
        $whereArchived = $includeArchived ? '' : ' AND f.archived = 0';
        $rows = $this->fetchAll(
            "SELECT f.id, f.user_id, f.asset_class_id, f.name, f.isin, f.fund_type,
                    f.currency, f.notes, f.archived, f.created_at, f.updated_at,
                    ac.name  AS asset_class_name,
                    ac.color AS asset_class_color,
                    (SELECT n.nav      FROM pac_fund_navs n WHERE n.fund_id = f.id ORDER BY n.nav_date DESC LIMIT 1) AS last_nav,
                    (SELECT n.nav_date FROM pac_fund_navs n WHERE n.fund_id = f.id ORDER BY n.nav_date DESC LIMIT 1) AS last_nav_date
             FROM pac_funds f
             LEFT JOIN asset_classes ac ON ac.id = f.asset_class_id
             WHERE f.user_id = ?{$whereArchived}
             ORDER BY f.archived ASC, f.name ASC",
            [$userId],
        );
        return array_map(static fn(array $r): PacFund => PacFund::fromRow($r), $rows);
    }

    public function findById(int $id, int $userId): ?PacFund
    {
        $row = $this->fetchOne(
            "SELECT f.id, f.user_id, f.asset_class_id, f.name, f.isin, f.fund_type,
                    f.currency, f.notes, f.archived, f.created_at, f.updated_at,
                    ac.name  AS asset_class_name, ac.color AS asset_class_color,
                    (SELECT n.nav      FROM pac_fund_navs n WHERE n.fund_id = f.id ORDER BY n.nav_date DESC LIMIT 1) AS last_nav,
                    (SELECT n.nav_date FROM pac_fund_navs n WHERE n.fund_id = f.id ORDER BY n.nav_date DESC LIMIT 1) AS last_nav_date
             FROM pac_funds f
             LEFT JOIN asset_classes ac ON ac.id = f.asset_class_id
             WHERE f.id = ? AND f.user_id = ? LIMIT 1",
            [$id, $userId],
        );
        return $row !== null ? PacFund::fromRow($row) : null;
    }

    public function findByName(int $userId, string $name): ?PacFund
    {
        $row = $this->fetchOne(
            'SELECT id, user_id, asset_class_id, name, isin, fund_type, currency, notes, archived, created_at, updated_at
             FROM pac_funds
             WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
            [$userId, $name],
        );
        return $row !== null ? PacFund::fromRow($row) : null;
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

    // ─── NAV management (storico) ────────────────────────────────────────────

    public function upsertNav(int $fundId, string $navDate, string $nav): void
    {
        $this->exec(
            'INSERT INTO pac_fund_navs (fund_id, nav_date, nav)
             VALUES (?, ?, ?)
             ON CONFLICT(fund_id, nav_date) DO UPDATE SET nav = excluded.nav',
            [$fundId, $navDate, $nav],
        );
    }

    public function navOnOrBefore(int $fundId, string $date): ?float
    {
        $val = $this->fetchScalar(
            'SELECT nav FROM pac_fund_navs
             WHERE fund_id = ? AND nav_date <= ?
             ORDER BY nav_date DESC LIMIT 1',
            [$fundId, $date],
        );
        return $val === false || $val === null ? null : (float) $val;
    }

    /**
     * @return list<array{id:int, fund_id:int, nav_date:string, nav:string}>
     */
    public function navHistory(int $fundId, int $limit = 365): array
    {
        $limit = max(1, min(3650, $limit));
        $rows = $this->fetchAll(
            "SELECT id, fund_id, nav_date, nav
             FROM pac_fund_navs
             WHERE fund_id = ?
             ORDER BY nav_date DESC
             LIMIT {$limit}",
            [$fundId],
        );
        return array_map(static fn(array $r): array => [
            'id'        => (int) $r['id'],
            'fund_id'   => (int) $r['fund_id'],
            'nav_date'  => (string) $r['nav_date'],
            'nav'       => number_format((float) $r['nav'], 6, '.', ''),
        ], $rows);
    }

    public function deleteNavById(int $id, int $fundId): int
    {
        $stmt = $this->exec(
            'DELETE FROM pac_fund_navs WHERE id = ? AND fund_id = ?',
            [$id, $fundId],
        );
        return $stmt->rowCount();
    }
}
