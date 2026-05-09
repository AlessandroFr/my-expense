<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity PacContribution. Singolo versamento su un piano PAC.
 *
 * source:
 *   - 'auto'   generato dal PacService::generatePending (idempotente per data)
 *   - 'manual' inserito manualmente dall'utente
 *   - 'import' rilevato dal BankStatementImporter su keyword/IBAN
 *
 * Se NAV alla data e' disponibile (vedi pac_fund_navs), units = amount / nav.
 * `transfer_id` linka il Transfer atomico CC -> conto PAC.
 */
final class PacContribution extends BaseEntity
{
    public const SOURCES = ['auto', 'manual', 'import'];

    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly int $planId,
        public readonly string $contributionDate,
        public readonly float $amount,
        public readonly ?float $nav,
        public readonly ?float $units,
        public readonly ?int $transferId,
        public readonly string $source,
        public readonly ?string $notes,
        public readonly ?string $createdAt = null,
        public readonly ?string $planName = null,
        public readonly ?string $fundName = null,
        public readonly ?int $fundId = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:               (int) $row['id'],
            userId:           (int) $row['user_id'],
            planId:           (int) $row['plan_id'],
            contributionDate: (string) $row['contribution_date'],
            amount:           (float) $row['amount'],
            nav:              isset($row['nav'])         && $row['nav']         !== null ? (float) $row['nav']   : null,
            units:            isset($row['units'])       && $row['units']       !== null ? (float) $row['units'] : null,
            transferId:       isset($row['transfer_id']) && $row['transfer_id'] !== null ? (int)   $row['transfer_id'] : null,
            source:           (string) ($row['source'] ?? 'manual'),
            notes:            isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            createdAt:        isset($row['created_at']) ? (string) $row['created_at'] : null,
            planName:         isset($row['plan_name']) ? (string) $row['plan_name'] : null,
            fundName:         isset($row['fund_name']) ? (string) $row['fund_name'] : null,
            fundId:           isset($row['fund_id'])   && $row['fund_id'] !== null ? (int) $row['fund_id'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'                => $this->id,
            'user_id'           => $this->userId,
            'plan_id'           => $this->planId,
            'contribution_date' => $this->contributionDate,
            'amount'            => number_format($this->amount, 2, '.', ''),
            'nav'               => $this->nav   !== null ? number_format($this->nav,   6, '.', '') : null,
            'units'             => $this->units !== null ? number_format($this->units, 6, '.', '') : null,
            'transfer_id'       => $this->transferId,
            'source'            => $this->source,
            'notes'             => $this->notes,
            'created_at'        => $this->createdAt,
            'plan_name'         => $this->planName,
            'fund_name'         => $this->fundName,
            'fund_id'           => $this->fundId,
        ];
    }
}
