<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity PacPlan. Piano periodico di versamento su un fondo via conto PAC.
 *
 * Frequenze: weekly | monthly | quarterly | yearly. La generazione delle
 * contribuzioni e' guidata da `last_generated_date` (idempotente, vedi
 * PacService::generatePending).
 */
final class PacPlan extends BaseEntity
{
    public const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly int $accountId,
        public readonly ?int $sourceAccountId,
        public readonly int $fundId,
        public readonly string $name,
        public readonly string $frequency,
        public readonly float $amount,
        public readonly string $startDate,
        public readonly ?string $endDate,
        public readonly ?string $lastGeneratedDate,
        public readonly ?string $beneficiaryIban,
        public readonly ?string $beneficiaryKeyword,
        public readonly bool $active,
        public readonly ?string $notes,
        public readonly ?string $createdAt = null,
        public readonly ?string $updatedAt = null,
        public readonly ?string $accountName = null,
        public readonly ?string $sourceAccountName = null,
        public readonly ?string $fundName = null,
        public readonly ?string $assetClassName = null,
        public readonly ?string $assetClassColor = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:                  (int) $row['id'],
            userId:              (int) $row['user_id'],
            accountId:           (int) $row['account_id'],
            sourceAccountId:     isset($row['source_account_id']) && $row['source_account_id'] !== null ? (int) $row['source_account_id'] : null,
            fundId:              (int) $row['fund_id'],
            name:                (string) $row['name'],
            frequency:           (string) ($row['frequency'] ?? 'monthly'),
            amount:              (float) $row['amount'],
            startDate:           (string) $row['start_date'],
            endDate:             isset($row['end_date'])            && $row['end_date']            !== null ? (string) $row['end_date']            : null,
            lastGeneratedDate:   isset($row['last_generated_date']) && $row['last_generated_date'] !== null ? (string) $row['last_generated_date'] : null,
            beneficiaryIban:     isset($row['beneficiary_iban'])    && $row['beneficiary_iban']    !== null ? (string) $row['beneficiary_iban']    : null,
            beneficiaryKeyword:  isset($row['beneficiary_keyword']) && $row['beneficiary_keyword'] !== null ? (string) $row['beneficiary_keyword'] : null,
            active:              (bool) ($row['active'] ?? 1),
            notes:               isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            createdAt:           isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:           isset($row['updated_at']) ? (string) $row['updated_at'] : null,
            accountName:         isset($row['account_name'])        ? (string) $row['account_name']        : null,
            sourceAccountName:   isset($row['source_account_name']) ? (string) $row['source_account_name'] : null,
            fundName:            isset($row['fund_name'])           ? (string) $row['fund_name']           : null,
            assetClassName:      isset($row['asset_class_name'])    ? (string) $row['asset_class_name']    : null,
            assetClassColor:     isset($row['asset_class_color'])   ? (string) $row['asset_class_color']   : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'                   => $this->id,
            'user_id'              => $this->userId,
            'account_id'           => $this->accountId,
            'source_account_id'    => $this->sourceAccountId,
            'fund_id'              => $this->fundId,
            'name'                 => $this->name,
            'frequency'            => $this->frequency,
            'amount'               => number_format($this->amount, 2, '.', ''),
            'start_date'           => $this->startDate,
            'end_date'             => $this->endDate,
            'last_generated_date'  => $this->lastGeneratedDate,
            'beneficiary_iban'     => $this->beneficiaryIban,
            'beneficiary_keyword'  => $this->beneficiaryKeyword,
            'active'               => $this->active ? 1 : 0,
            'notes'                => $this->notes,
            'created_at'           => $this->createdAt,
            'updated_at'           => $this->updatedAt,
            'account_name'         => $this->accountName,
            'source_account_name'  => $this->sourceAccountName,
            'fund_name'            => $this->fundName,
            'asset_class_name'     => $this->assetClassName,
            'asset_class_color'    => $this->assetClassColor,
        ];
    }
}
