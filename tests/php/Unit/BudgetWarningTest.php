<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Entities\Budget;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Soglie dell'avviso budget (no DB). Il frontend legge `exceeded` e
 * `near_limit` da toArray(): se una delle due sparisce dall'envelope, i toast
 * di /expenses smettono di comparire senza che nulla segnali l'errore.
 */
#[CoversClass(Budget::class)]
final class BudgetWarningTest extends TestCase
{
    public function testSottoLaSogliaNessunAvviso(): void
    {
        $b = $this->budget(amount: 100.0, spent: 79.99);
        self::assertFalse($b->exceeded());
        self::assertFalse($b->nearLimit());
    }

    public function testAOttantaPerCentoScattaNearLimit(): void
    {
        $b = $this->budget(amount: 100.0, spent: 80.0);
        self::assertTrue($b->nearLimit());
        self::assertFalse($b->exceeded());
    }

    /** Al 100% esatto il tetto e' raggiunto ma non sforato. */
    public function testAlCentoPerCentoEsattoNonESforato(): void
    {
        $b = $this->budget(amount: 100.0, spent: 100.0);
        self::assertTrue($b->nearLimit());
        self::assertFalse($b->exceeded());
    }

    public function testOltreIlTettoScattaExceeded(): void
    {
        $b = $this->budget(amount: 100.0, spent: 100.01);
        self::assertTrue($b->exceeded());
        self::assertFalse($b->nearLimit());
    }

    public function testBudgetAZeroNonDivideMaiPerZero(): void
    {
        $b = $this->budget(amount: 0.0, spent: 0.0);
        self::assertSame(0.0, $b->progressPct());
        self::assertFalse($b->exceeded());
        self::assertFalse($b->nearLimit());
    }

    /** Le chiavi lette da public/js/pages/expenses.js::showBudgetWarning. */
    public function testToArrayEspoineLeChiaviLetteDalFrontend(): void
    {
        $keys = array_keys($this->budget(amount: 100.0, spent: 50.0)->toArray());
        foreach (['name', 'amount', 'spent', 'progress_pct', 'exceeded', 'near_limit'] as $k) {
            self::assertContains($k, $keys, "toArray() deve esporre '{$k}'");
        }
    }

    private function budget(float $amount, float $spent): Budget
    {
        return new Budget(
            id:         1,
            categoryId: 1,
            yearMonth:  '2026-08',
            amount:     $amount,
            name:       'Spesa',
            spent:      $spent,
        );
    }
}
