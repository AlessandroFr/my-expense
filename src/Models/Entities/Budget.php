<?php
declare(strict_types=1);

namespace App\Models\Entities;

/**
 * Entity Budget. Mappa una row della tabella `budgets` con join a `categories`
 * e i campi calcolati di progresso (spent, remaining, progress_pct).
 *
 * UNIQUE su (user_id, category_id, year_month).
 */
final class Budget extends BaseEntity
{
    public function __construct(
        public readonly int $id,
        public readonly int $categoryId,
        public readonly string $yearMonth,
        public readonly float $amount,
        public readonly string $name = '',
        public readonly string $color = '#6c757d',
        public readonly ?string $icon = null,
        public readonly float $spent = 0.0,
    ) {
    }

    public function remaining(): float
    {
        return round($this->amount - $this->spent, 2);
    }

    public function progressPct(): float
    {
        return $this->amount > 0 ? round(($this->spent / $this->amount) * 100.0, 1) : 0.0;
    }

    public static function fromRow(array $row): static
    {
        return new self(
            id:         (int) ($row['id'] ?? 0),
            categoryId: (int) ($row['category_id'] ?? 0),
            yearMonth:  (string) ($row['year_month'] ?? ''),
            amount:     (float) ($row['amount'] ?? 0),
            name:       (string) ($row['name'] ?? ''),
            color:      (string) ($row['color'] ?? '#6c757d'),
            icon:       isset($row['icon']) && $row['icon'] !== null ? (string) $row['icon'] : null,
            spent:      (float) ($row['spent'] ?? 0),
        );
    }

    public function toArray(): array
    {
        return [
            'id'           => $this->id,
            'category_id'  => $this->categoryId,
            'name'         => $this->name,
            'color'        => $this->color,
            'icon'         => $this->icon,
            'year_month'   => $this->yearMonth,
            'amount'       => round($this->amount, 2),
            'spent'        => round($this->spent, 2),
            'remaining'    => $this->remaining(),
            'progress_pct' => $this->progressPct(),
        ];
    }
}
