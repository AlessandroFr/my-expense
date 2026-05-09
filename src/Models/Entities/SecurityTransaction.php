<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity SecurityTransaction. Operazione su uno strumento finanziario:
 *   BUY/SELL    -> qty * price + fee, expense_id linkato
 *   DIVIDEND    -> proventi cedola/dividendo, income_id linkato
 *   FEE         -> commissione standalone (custodia, ecc.), expense_id linkato
 *   SPLIT       -> aggiustamento qty (qty positiva = received, price=0)
 *
 * `expense_id` / `income_id` sono UNIQUE FK alle scritture contabili
 * generate dal SecuritiesService nella stessa transazione.
 */
final class SecurityTransaction extends BaseEntity
{
    public const KIND_BUY      = 'BUY';
    public const KIND_SELL     = 'SELL';
    public const KIND_DIVIDEND = 'DIVIDEND';
    public const KIND_FEE      = 'FEE';
    public const KIND_SPLIT    = 'SPLIT';

    public const KINDS = [self::KIND_BUY, self::KIND_SELL, self::KIND_DIVIDEND, self::KIND_FEE, self::KIND_SPLIT];

    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly int $accountId,
        public readonly int $instrumentId,
        public readonly string $kind,
        public readonly string $tradeDate,
        public readonly ?string $settlementDate,
        public readonly float $quantity,
        public readonly float $price,
        public readonly float $fee,
        public readonly float $grossAmount,
        public readonly float $netAmount,
        public readonly float $taxWithheld,
        public readonly ?int $expenseId,
        public readonly ?int $incomeId,
        public readonly ?string $notes,
        public readonly ?string $createdAt = null,
        public readonly ?string $updatedAt = null,
        public readonly ?string $instrumentName = null,
        public readonly ?string $instrumentTicker = null,
        public readonly ?string $instrumentIsin = null,
        public readonly ?string $accountName = null,
    ) {
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:                (int) $row['id'],
            userId:            (int) $row['user_id'],
            accountId:         (int) $row['account_id'],
            instrumentId:      (int) $row['instrument_id'],
            kind:              (string) $row['kind'],
            tradeDate:         (string) $row['trade_date'],
            settlementDate:    isset($row['settlement_date']) && $row['settlement_date'] !== null ? (string) $row['settlement_date'] : null,
            quantity:          (float) $row['quantity'],
            price:             (float) $row['price'],
            fee:               (float) ($row['fee']          ?? 0),
            grossAmount:       (float) ($row['gross_amount'] ?? 0),
            netAmount:         (float) ($row['net_amount']   ?? 0),
            taxWithheld:       (float) ($row['tax_withheld'] ?? 0),
            expenseId:         isset($row['expense_id']) && $row['expense_id'] !== null ? (int) $row['expense_id'] : null,
            incomeId:          isset($row['income_id'])  && $row['income_id']  !== null ? (int) $row['income_id']  : null,
            notes:             isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            createdAt:         isset($row['created_at']) ? (string) $row['created_at'] : null,
            updatedAt:         isset($row['updated_at']) ? (string) $row['updated_at'] : null,
            instrumentName:    isset($row['instrument_name'])   ? (string) $row['instrument_name']   : null,
            instrumentTicker:  isset($row['instrument_ticker']) && $row['instrument_ticker'] !== null ? (string) $row['instrument_ticker'] : null,
            instrumentIsin:    isset($row['instrument_isin'])   && $row['instrument_isin']   !== null ? (string) $row['instrument_isin']   : null,
            accountName:       isset($row['account_name'])      ? (string) $row['account_name']      : null,
        );
    }

    public function toArray(): array
    {
        return [
            'id'                 => $this->id,
            'user_id'            => $this->userId,
            'account_id'         => $this->accountId,
            'instrument_id'      => $this->instrumentId,
            'kind'               => $this->kind,
            'trade_date'         => $this->tradeDate,
            'settlement_date'    => $this->settlementDate,
            'quantity'           => number_format($this->quantity, 6, '.', ''),
            'price'              => number_format($this->price,    6, '.', ''),
            'fee'                => number_format($this->fee,         2, '.', ''),
            'gross_amount'       => number_format($this->grossAmount, 2, '.', ''),
            'net_amount'         => number_format($this->netAmount,   2, '.', ''),
            'tax_withheld'       => number_format($this->taxWithheld, 2, '.', ''),
            'expense_id'         => $this->expenseId,
            'income_id'          => $this->incomeId,
            'notes'              => $this->notes,
            'created_at'         => $this->createdAt,
            'updated_at'         => $this->updatedAt,
            'instrument_name'    => $this->instrumentName,
            'instrument_ticker'  => $this->instrumentTicker,
            'instrument_isin'    => $this->instrumentIsin,
            'account_name'       => $this->accountName,
        ];
    }
}
