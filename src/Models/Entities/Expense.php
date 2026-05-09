<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity Expense (read-only DTO). Mappa una row della tabella `expenses` con
 * campi join opzionali da categories/accounts/contacts.
 *
 * I campi MySQL DECIMAL vengono restituiti da PDO come stringhe; qui li
 * convertiamo in float per la serializzazione JSON.
 */
final class Expense extends BaseEntity
{
    /**
     * @param list<array{id:int,name:string,color:string}> $tags
     */
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly ?int $categoryId,
        public readonly ?int $contactId,
        public readonly ?int $accountId,
        public readonly float $amount,
        public readonly ?string $description,
        public readonly ?string $sharedWith,
        public readonly ?float $shareAmount,
        public readonly string $paymentMethod,
        public readonly string $expenseDate,
        public readonly ?string $valueDate,
        public readonly ?string $importHash,
        public readonly ?string $createdAt,
        public readonly ?string $updatedAt,
        // Campi join opzionali
        public readonly ?string $categoryName = null,
        public readonly ?string $categoryColor = null,
        public readonly ?string $categoryIcon = null,
        public readonly ?string $accountName = null,
        public readonly ?string $accountColor = null,
        public readonly ?string $accountIcon = null,
        public readonly ?string $contactName = null,
        public readonly ?string $contactColor = null,
        public readonly ?string $contactType = null,
        public readonly array $tags = [],
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:            (int) $row['id'],
            userId:        (int) $row['user_id'],
            categoryId:    isset($row['category_id']) && $row['category_id'] !== null ? (int) $row['category_id'] : null,
            contactId:     isset($row['contact_id'])  && $row['contact_id']  !== null ? (int) $row['contact_id']  : null,
            accountId:     isset($row['account_id'])  && $row['account_id']  !== null ? (int) $row['account_id']  : null,
            amount:        (float) $row['amount'],
            description:   isset($row['description']) && $row['description'] !== null ? (string) $row['description'] : null,
            sharedWith:    isset($row['shared_with']) && $row['shared_with'] !== null ? (string) $row['shared_with'] : null,
            shareAmount:   isset($row['share_amount']) && $row['share_amount'] !== null ? (float) $row['share_amount'] : null,
            paymentMethod: (string) $row['payment_method'],
            expenseDate:   (string) $row['expense_date'],
            valueDate:     isset($row['value_date'])   && $row['value_date']   !== null ? (string) $row['value_date']   : null,
            importHash:    isset($row['import_hash'])  && $row['import_hash']  !== null ? (string) $row['import_hash']  : null,
            createdAt:     isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:     isset($row['updated_at']) ? (string) $row['updated_at'] : null,
            categoryName:  isset($row['category_name']) ? (string) $row['category_name'] : null,
            categoryColor: isset($row['category_color']) ? (string) $row['category_color'] : null,
            categoryIcon:  isset($row['category_icon']) ? (string) $row['category_icon'] : null,
            accountName:   isset($row['account_name']) ? (string) $row['account_name'] : null,
            accountColor:  isset($row['account_color']) ? (string) $row['account_color'] : null,
            accountIcon:   isset($row['account_icon']) ? (string) $row['account_icon'] : null,
            contactName:   isset($row['contact_name']) ? (string) $row['contact_name'] : null,
            contactColor:  isset($row['contact_color']) ? (string) $row['contact_color'] : null,
            contactType:   isset($row['contact_type']) ? (string) $row['contact_type'] : null,
            tags:          isset($row['tags']) && is_array($row['tags']) ? $row['tags'] : [],
        );
    }

    /**
     * Forma serializzata identica al payload restituito oggi da
     * Expense::listForUser/findForUser per garantire compatibilita' col JS frontend.
     */
    public function toArray(): array
    {
        return [
            'id'             => $this->id,
            'user_id'        => $this->userId,
            'category_id'    => $this->categoryId,
            'contact_id'     => $this->contactId,
            'account_id'     => $this->accountId,
            'amount'         => number_format($this->amount, 2, '.', ''),
            'description'    => $this->description,
            'shared_with'    => $this->sharedWith,
            'share_amount'   => $this->shareAmount !== null ? number_format($this->shareAmount, 2, '.', '') : null,
            'payment_method' => $this->paymentMethod,
            'expense_date'   => $this->expenseDate,
            'value_date'     => $this->valueDate,
            'created_at'     => $this->createdAt,
            'updated_at'     => $this->updatedAt,
            'category_name'  => $this->categoryName,
            'category_color' => $this->categoryColor,
            'category_icon'  => $this->categoryIcon,
            'account_name'   => $this->accountName,
            'account_color'  => $this->accountColor,
            'account_icon'   => $this->accountIcon,
            'contact_name'   => $this->contactName,
            'contact_color'  => $this->contactColor,
            'contact_type'   => $this->contactType,
            'tags'           => $this->tags,
        ];
    }
}
