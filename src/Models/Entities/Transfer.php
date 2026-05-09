<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity Transfer. Mappa una row di `transfers` con i join opzionali su
 * `accounts` per nome/colore/icona di sorgente e destinazione.
 *
 * Un Transfer corrisponde sempre a una coppia atomica di scritture su
 * `expenses` (uscita dal source) e `incomes` (entrata sul destination),
 * entrambe flaggate `is_transfer=1` con `transfer_id` settato.
 */
final class Transfer extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly int $sourceAccountId,
        public readonly int $destinationAccountId,
        public readonly float $amount,
        public readonly string $transferDate,
        public readonly ?string $description,
        public readonly ?string $notes,
        public readonly ?string $createdAt,
        public readonly ?string $updatedAt,
        public readonly ?string $sourceName = null,
        public readonly ?string $sourceColor = null,
        public readonly ?string $sourceIcon = null,
        public readonly ?string $destinationName = null,
        public readonly ?string $destinationColor = null,
        public readonly ?string $destinationIcon = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:                    (int) $row['id'],
            userId:                (int) $row['user_id'],
            sourceAccountId:       (int) $row['source_account_id'],
            destinationAccountId:  (int) $row['destination_account_id'],
            amount:                (float) $row['amount'],
            transferDate:          (string) $row['transfer_date'],
            description:           isset($row['description']) && $row['description'] !== null ? (string) $row['description'] : null,
            notes:                 isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            createdAt:             isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:             isset($row['updated_at']) ? (string) $row['updated_at'] : null,
            sourceName:            isset($row['source_name']) ? (string) $row['source_name'] : null,
            sourceColor:           isset($row['source_color']) ? (string) $row['source_color'] : null,
            sourceIcon:            isset($row['source_icon']) && $row['source_icon'] !== null ? (string) $row['source_icon'] : null,
            destinationName:       isset($row['destination_name']) ? (string) $row['destination_name'] : null,
            destinationColor:      isset($row['destination_color']) ? (string) $row['destination_color'] : null,
            destinationIcon:       isset($row['destination_icon']) && $row['destination_icon'] !== null ? (string) $row['destination_icon'] : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'                       => $this->id,
            'user_id'                  => $this->userId,
            'source_account_id'        => $this->sourceAccountId,
            'destination_account_id'   => $this->destinationAccountId,
            'amount'                   => number_format($this->amount, 2, '.', ''),
            'transfer_date'            => $this->transferDate,
            'description'              => $this->description,
            'notes'                    => $this->notes,
            'created_at'               => $this->createdAt,
            'updated_at'               => $this->updatedAt,
            'source_name'              => $this->sourceName,
            'source_color'             => $this->sourceColor,
            'source_icon'              => $this->sourceIcon,
            'destination_name'         => $this->destinationName,
            'destination_color'        => $this->destinationColor,
            'destination_icon'         => $this->destinationIcon,
        ];
    }
}
