<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity Account. Mappa una row di `accounts`. Tipo in {checking, card, cash,
 * savings, investment, other}. UNIQUE su (user_id, name).
 */
final class Account extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $type,
        public readonly string $color,
        public readonly ?string $icon,
        public readonly float $openingBalance,
        public readonly ?string $iban,
        public readonly ?string $bic,
        public readonly ?string $bankName,
        public readonly ?string $accountHolder,
        public readonly ?string $accountNumber,
        public readonly ?string $notes,
        public readonly bool $archived,
        public readonly bool $isDefaultCash,
        public readonly int $sortOrder,
        public readonly ?float $balance = null,
        public readonly ?float $expensesTotal = null,
        public readonly ?float $incomesTotal = null,
        public readonly ?string $createdAt = null,
        public readonly ?string $updatedAt = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:             (int) $row['id'],
            name:           (string) $row['name'],
            type:           (string) $row['type'],
            color:          (string) ($row['color'] ?? '#6c757d'),
            icon:           isset($row['icon']) && $row['icon'] !== null ? (string) $row['icon'] : null,
            openingBalance: (float) ($row['opening_balance'] ?? 0),
            iban:           isset($row['iban']) && $row['iban'] !== null ? (string) $row['iban'] : null,
            bic:            isset($row['bic']) && $row['bic'] !== null ? (string) $row['bic'] : null,
            bankName:       isset($row['bank_name']) && $row['bank_name'] !== null ? (string) $row['bank_name'] : null,
            accountHolder:  isset($row['account_holder']) && $row['account_holder'] !== null ? (string) $row['account_holder'] : null,
            accountNumber:  isset($row['account_number']) && $row['account_number'] !== null ? (string) $row['account_number'] : null,
            notes:          isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            archived:       (bool) ($row['archived'] ?? 0),
            isDefaultCash:  (bool) ($row['is_default_cash'] ?? 0),
            sortOrder:      (int) ($row['sort_order'] ?? 0),
            balance:        isset($row['balance']) ? (float) $row['balance'] : null,
            expensesTotal:  isset($row['expenses_total']) ? (float) $row['expenses_total'] : null,
            incomesTotal:   isset($row['incomes_total']) ? (float) $row['incomes_total'] : null,
            createdAt:      isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:      isset($row['updated_at']) ? (string) $row['updated_at'] : null,
        );
    }

    public function toArray(): array
    {
        $out = [
            'id'              => $this->id,
            'name'            => $this->name,
            'type'            => $this->type,
            'color'           => $this->color,
            'icon'            => $this->icon,
            'opening_balance' => number_format($this->openingBalance, 2, '.', ''),
            'iban'            => $this->iban,
            'bic'             => $this->bic,
            'bank_name'       => $this->bankName,
            'account_holder'  => $this->accountHolder,
            'account_number'  => $this->accountNumber,
            'notes'           => $this->notes,
            'archived'        => $this->archived ? 1 : 0,
            'is_default_cash' => $this->isDefaultCash ? 1 : 0,
            'sort_order'      => $this->sortOrder,
            'created_at'      => $this->createdAt,
            'updated_at'      => $this->updatedAt,
        ];
        if ($this->balance !== null) {
            $out['balance']        = round($this->balance, 2);
            $out['expenses_total'] = round((float) $this->expensesTotal, 2);
            $out['incomes_total']  = round((float) $this->incomesTotal, 2);
        }
        return $out;
    }
}
