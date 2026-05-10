<?php
declare(strict_types=1);

namespace App\Services;

use DateTimeImmutable;
use InvalidArgumentException;

/**
 * Helper statico per il calcolo delle rate di una spesa rateizzata.
 *
 * Pure-functions condivise tra ExpenseService (form manuale) e
 * BankStatementImporter (commit import estratto conto). L'aritmetica usa
 * integer-cents per evitare drift float; l'eventuale resto della divisione
 * (es. 100/3) viene assorbito dalla rata #1.
 */
final class InstallmentCalculator
{
    public const FREQUENCIES = ['monthly', 'weekly', 'custom'];
    public const MIN_COUNT   = 2;
    public const MAX_COUNT   = 60;
    public const MIN_DAYS    = 1;
    public const MAX_DAYS    = 365;

    /**
     * Valida lo spec di rateizzazione e ritorna la versione normalizzata.
     *
     * @param array<string, mixed> $spec
     * @return array{count:int, frequency:string, custom_days:?int}
     */
    public static function validate(array $spec): array
    {
        $count = isset($spec['count']) ? (int) $spec['count'] : 0;
        if ($count < self::MIN_COUNT || $count > self::MAX_COUNT) {
            throw new InvalidArgumentException(
                'Numero di rate fuori intervallo (ammesso: '
                . self::MIN_COUNT . '–' . self::MAX_COUNT . ').'
            );
        }

        $frequency = (string) ($spec['frequency'] ?? 'monthly');
        if (!in_array($frequency, self::FREQUENCIES, true)) {
            throw new InvalidArgumentException(
                'Frequenza rate non valida (ammesse: ' . implode(', ', self::FREQUENCIES) . ').'
            );
        }

        $customDays = null;
        if ($frequency === 'custom') {
            $customDays = isset($spec['custom_days']) ? (int) $spec['custom_days'] : 0;
            if ($customDays < self::MIN_DAYS || $customDays > self::MAX_DAYS) {
                throw new InvalidArgumentException(
                    'Giorni tra rate fuori intervallo (ammesso: '
                    . self::MIN_DAYS . '–' . self::MAX_DAYS . ').'
                );
            }
        }

        return [
            'count'       => $count,
            'frequency'   => $frequency,
            'custom_days' => $customDays,
        ];
    }

    /**
     * Esplode un totale in N rate. Ritorna array di {seq, date, amount}
     * con `amount` come stringa decimale "12345.67" (compat DECIMAL(12,2)).
     *
     * Aritmetica integer-cents:
     *   $perRate   = intdiv(totalCents, N)
     *   $remainder = totalCents - perRate * N
     *   rata #1 amount = perRate + remainder; rate #2..N = perRate.
     *
     * Frequenza:
     *   - monthly: clamp fine-mese (31-gen → 28-feb → 31-mar) e ricalcolo
     *     ad ogni rata da startDate per evitare drift cumulativo.
     *   - weekly:  +7 giorni.
     *   - custom:  +N giorni (validato 1–365).
     *
     * @param string|float $totalAmount
     * @return list<array{seq:int, date:string, amount:string}>
     */
    public static function explode(
        string|float $totalAmount,
        int $count,
        string $startDate,
        string $frequency,
        ?int $customDays = null
    ): array {
        if ($count < self::MIN_COUNT || $count > self::MAX_COUNT) {
            throw new InvalidArgumentException('Numero di rate non valido.');
        }
        if (!in_array($frequency, self::FREQUENCIES, true)) {
            throw new InvalidArgumentException('Frequenza rate non valida.');
        }
        if ($frequency === 'custom' && ($customDays === null || $customDays < 1)) {
            throw new InvalidArgumentException('custom_days obbligatorio per frequency=custom.');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) {
            throw new InvalidArgumentException('Data iniziale non valida (atteso YYYY-MM-DD).');
        }

        $totalF = is_string($totalAmount) ? (float) str_replace(',', '.', $totalAmount) : (float) $totalAmount;
        $cents  = (int) round($totalF * 100);
        if ($cents < $count) {
            throw new InvalidArgumentException(
                'Importo troppo piccolo per ' . $count . ' rate (minimo 0.01€/rata).'
            );
        }

        $perRate   = intdiv($cents, $count);
        $remainder = $cents - ($perRate * $count);

        $start = new DateTimeImmutable($startDate);
        $rates = [];
        for ($i = 1; $i <= $count; $i++) {
            $amountCents = $perRate + ($i === 1 ? $remainder : 0);
            $rateDate    = self::dateForSeq($start, $i, $frequency, $customDays);
            $rates[] = [
                'seq'    => $i,
                'date'   => $rateDate->format('Y-m-d'),
                'amount' => number_format($amountCents / 100, 2, '.', ''),
            ];
        }
        return $rates;
    }

    /**
     * Calcola la data della rata $seq (1-based) a partire da $start.
     * Per monthly applica clamp fine-mese (31-gen → 28-feb → 31-mar).
     */
    private static function dateForSeq(
        DateTimeImmutable $start,
        int $seq,
        string $frequency,
        ?int $customDays
    ): DateTimeImmutable {
        $offset = $seq - 1;
        if ($offset === 0) return $start;

        if ($frequency === 'weekly') {
            return $start->modify('+' . ($offset * 7) . ' days');
        }
        if ($frequency === 'custom') {
            return $start->modify('+' . ($offset * (int) $customDays) . ' days');
        }
        return self::addMonthsClamped($start, $offset);
    }

    /**
     * Aggiunge $months a $date con clamp fine-mese: se il giorno della
     * data sorgente non esiste nel mese target (es. 31-gen + 1 mese),
     * si torna all'ultimo giorno del mese target (28/29 feb).
     */
    private static function addMonthsClamped(DateTimeImmutable $date, int $months): DateTimeImmutable
    {
        $day = (int) $date->format('j');
        $y   = (int) $date->format('Y');
        $m   = (int) $date->format('n');

        $totalMonths = ($y * 12 + ($m - 1)) + $months;
        $newYear  = intdiv($totalMonths, 12);
        $newMonth = ($totalMonths % 12) + 1;

        $daysInTarget = (int) (new DateTimeImmutable(sprintf('%04d-%02d-01', $newYear, $newMonth)))
            ->format('t');
        $newDay = min($day, $daysInTarget);

        return new DateTimeImmutable(sprintf('%04d-%02d-%02d', $newYear, $newMonth, $newDay));
    }
}
