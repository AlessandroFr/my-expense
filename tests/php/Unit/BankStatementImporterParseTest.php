<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\BankStatementImporter;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * Smoke test parser puro (no DB) — verifica che le helper di parsing data
 * e importo lavorino in modo deterministico su input sintetici.
 */
#[CoversClass(BankStatementImporter::class)]
final class BankStatementImporterParseTest extends TestCase
{
    public function testParseItalianDateFullYear(): void
    {
        self::assertSame('2026-04-15', $this->invoke('parseItDate', ['15/04/2026']));
    }

    public function testParseItalianDateTwoDigitYear20xx(): void
    {
        self::assertSame('2026-04-15', $this->invoke('parseItDate', ['15/04/26']));
    }

    public function testParseItalianDateTwoDigitYear19xx(): void
    {
        self::assertSame('1995-04-15', $this->invoke('parseItDate', ['15/04/95']));
    }

    public function testParseBankAmountNegativeWithEuroSign(): void
    {
        self::assertSame(12.34, $this->invoke('parseBankAmount', ['-12.34 €']));
    }

    public function testParseBankAmountItalianFormatThousands(): void
    {
        self::assertSame(5039.56, $this->invoke('parseBankAmount', ['5.039,56 €']));
    }

    public function testParseBankAmountPositive(): void
    {
        self::assertSame(1500.00, $this->invoke('parseBankAmount', ['1500.00 €']));
    }

    public function testComputeImportHashIsDeterministic(): void
    {
        $a = $this->invoke('computeImportHash', [42, '2026-04-15', -12.34, 'ESEMPIO MERCHANT']);
        $b = $this->invoke('computeImportHash', [42, '2026-04-15', -12.34, 'esempio   merchant']);
        self::assertSame($a, $b);
    }

    public function testComputeImportHashDiffersOnAmount(): void
    {
        $a = $this->invoke('computeImportHash', [42, '2026-04-15', -12.34, 'X']);
        $b = $this->invoke('computeImportHash', [42, '2026-04-15', -12.35, 'X']);
        self::assertNotSame($a, $b);
    }

    /**
     * @param  array<int,mixed> $args
     * @return mixed
     */
    private function invoke(string $method, array $args): mixed
    {
        $ref = new ReflectionClass(BankStatementImporter::class);
        $m   = $ref->getMethod($method);
        $m->setAccessible(true);
        return $m->invokeArgs(null, $args);
    }
}
