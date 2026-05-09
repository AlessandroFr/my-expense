<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity Income. Mappa una row della tabella `incomes` con join opzionali a
 * accounts e contacts.
 */
final class Income extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly ?int $accountId,
        public readonly ?int $contactId,
        public readonly string $source,
        public readonly ?string $description,
        public readonly float $amount,
        public readonly string $incomeDate,
        public readonly ?string $valueDate,
        public readonly ?string $importHash,
        public readonly ?string $createdAt,
        public readonly ?string $updatedAt,
        public readonly ?string $accountName = null,
        public readonly ?string $accountColor = null,
        public readonly ?string $accountIcon = null,
        public readonly ?string $contactName = null,
        public readonly ?string $contactColor = null,
        public readonly ?string $contactType = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:           (int) $row['id'],
            userId:       (int) $row['user_id'],
            accountId:    isset($row['account_id']) && $row['account_id'] !== null ? (int) $row['account_id'] : null,
            contactId:    isset($row['contact_id']) && $row['contact_id'] !== null ? (int) $row['contact_id'] : null,
            source:       (string) $row['source'],
            description:  isset($row['description']) && $row['description'] !== null ? (string) $row['description'] : null,
            amount:       (float) $row['amount'],
            incomeDate:   (string) $row['income_date'],
            valueDate:    isset($row['value_date']) && $row['value_date'] !== null ? (string) $row['value_date'] : null,
            importHash:   isset($row['import_hash']) && $row['import_hash'] !== null ? (string) $row['import_hash'] : null,
            createdAt:    isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:    isset($row['updated_at']) ? (string) $row['updated_at'] : null,
            accountName:  isset($row['account_name']) ? (string) $row['account_name'] : null,
            accountColor: isset($row['account_color']) ? (string) $row['account_color'] : null,
            accountIcon:  isset($row['account_icon']) ? (string) $row['account_icon'] : null,
            contactName:  isset($row['contact_name']) ? (string) $row['contact_name'] : null,
            contactColor: isset($row['contact_color']) ? (string) $row['contact_color'] : null,
            contactType:  isset($row['contact_type']) ? (string) $row['contact_type'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'           => $this->id,
            'user_id'      => $this->userId,
            'account_id'   => $this->accountId,
            'contact_id'   => $this->contactId,
            'source'       => $this->source,
            'description'  => $this->description,
            'amount'       => number_format($this->amount, 2, '.', ''),
            'income_date'  => $this->incomeDate,
            'value_date'   => $this->valueDate,
            'created_at'   => $this->createdAt,
            'updated_at'   => $this->updatedAt,
            'account_name' => $this->accountName,
            'account_color'=> $this->accountColor,
            'account_icon' => $this->accountIcon,
            'contact_name' => $this->contactName,
            'contact_color'=> $this->contactColor,
            'contact_type' => $this->contactType,
        ];
    }
}
