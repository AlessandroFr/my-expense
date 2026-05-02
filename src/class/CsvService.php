<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use RuntimeException;

/**
 * CSV import/export per spese.
 *
 * Formato:
 *   - separatore `;` (standard Excel italiano)
 *   - encoding UTF-8 con BOM
 *   - header: Data;Categoria;Descrizione;Importo;Pagamento
 *   - data formato YYYY-MM-DD (export); accetta anche DD/MM/YYYY in import
 *   - importo: decimal, accetta sia `,` sia `.`
 *   - pagamento: cash|card|transfer|other (o etichetta IT: contanti/carta/bonifico/altro)
 */
final class CsvService
{
    public const HEADERS = ['Data', 'Categoria', 'Descrizione', 'Importo', 'Pagamento'];
    private const PAY_LABELS_IT = [
        'contanti' => 'cash',
        'carta'    => 'card',
        'bonifico' => 'transfer',
        'altro'    => 'other',
    ];

    /**
     * @param array<int, array<string,mixed>> $rows
     */
    public static function exportToStdout(array $rows, string $filenameStem = 'expenses'): void
    {
        $filename = $filenameStem . '_' . date('Y-m-d') . '.csv';
        if (!headers_sent()) {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Cache-Control: no-store');
        }

        $out = fopen('php://output', 'w');
        if ($out === false) {
            throw new RuntimeException('Impossibile aprire stream output.');
        }
        fwrite($out, "\xEF\xBB\xBF");

        fputcsv($out, self::HEADERS, ';', '"', '\\');
        foreach ($rows as $r) {
            fputcsv($out, [
                (string) ($r['expense_date']   ?? ''),
                (string) ($r['category_name']  ?? ''),
                (string) ($r['description']    ?? ''),
                self::formatAmount((float) ($r['amount'] ?? 0)),
                (string) ($r['payment_method'] ?? ''),
            ], ';', '"', '\\');
        }
        fclose($out);
    }

    /**
     * @return array{
     *   imported:int, skipped:int,
     *   errors: array<int, array{row:int, message:string}>
     * }
     */
    public static function importFromUpload(int $userId, string $tmpPath, bool $createMissingCategories = true): array
    {
        if (!is_uploaded_file($tmpPath) && !is_file($tmpPath)) {
            throw new InvalidArgumentException('File non valido.');
        }

        $delimiter = self::detectDelimiter($tmpPath);

        $fh = fopen($tmpPath, 'r');
        if ($fh === false) {
            throw new RuntimeException('Impossibile leggere il file.');
        }
        $first = fread($fh, 3);
        if ($first !== "\xEF\xBB\xBF") {
            rewind($fh);
        }

        $header = fgetcsv($fh, 0, $delimiter, '"', '\\');
        if ($header === false) {
            fclose($fh);
            throw new InvalidArgumentException('CSV vuoto o illeggibile.');
        }
        $header = array_map(static fn($c) => mb_strtolower(trim((string) $c)), $header);

        $idx = [
            'date'        => self::columnIndex($header, ['data', 'date']),
            'category'    => self::columnIndex($header, ['categoria', 'category']),
            'description' => self::columnIndex($header, ['descrizione', 'description', 'note']),
            'amount'      => self::columnIndex($header, ['importo', 'amount', 'totale']),
            'payment'     => self::columnIndex($header, ['pagamento', 'payment', 'metodo']),
        ];
        if ($idx['date'] === null || $idx['amount'] === null) {
            fclose($fh);
            throw new InvalidArgumentException('Colonne richieste mancanti: serve almeno Data e Importo.');
        }

        $catCache = [];
        foreach (Category::allForUser($userId) as $c) {
            $catCache[mb_strtolower((string) $c['name'])] = (int) $c['id'];
        }

        $imported = 0;
        $skipped  = 0;
        $errors   = [];
        $lineNum  = 1;

        while (($row = fgetcsv($fh, 0, $delimiter, '"', '\\')) !== false) {
            $lineNum++;
            if (count($row) === 1 && trim((string) $row[0]) === '') {
                continue;
            }

            try {
                $date    = self::parseDate((string) ($row[$idx['date']] ?? ''));
                $amount  = self::parseAmount((string) ($row[$idx['amount']] ?? ''));
                $payment = self::parsePayment((string) ($row[$idx['payment']] ?? 'card'));

                $catName = $idx['category'] !== null ? trim((string) ($row[$idx['category']] ?? '')) : '';
                $catId   = null;
                if ($catName !== '') {
                    $key = mb_strtolower($catName);
                    if (isset($catCache[$key])) {
                        $catId = $catCache[$key];
                    } elseif ($createMissingCategories) {
                        $catId = Category::create($userId, $catName, '#6c757d', null, 0);
                        $catCache[$key] = $catId;
                    } else {
                        throw new InvalidArgumentException("Categoria '{$catName}' non esistente.");
                    }
                }

                $desc = $idx['description'] !== null
                    ? (trim((string) ($row[$idx['description']] ?? '')) ?: null)
                    : null;

                Expense::create($userId, $catId, $amount, $desc, $payment, $date);
                $imported++;
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = ['row' => $lineNum, 'message' => $e->getMessage()];
            }
        }

        fclose($fh);
        return ['imported' => $imported, 'skipped' => $skipped, 'errors' => $errors];
    }

    private static function detectDelimiter(string $path): string
    {
        $fh = fopen($path, 'r');
        if ($fh === false) return ';';
        $sample = fread($fh, 4096);
        fclose($fh);
        if ($sample === false) return ';';
        if (strpos($sample, "\xEF\xBB\xBF") === 0) {
            $sample = substr($sample, 3);
        }
        $line = strtok($sample, "\r\n") ?: '';
        $candidates = [';' => 0, ',' => 0, "\t" => 0, '|' => 0];
        foreach ($candidates as $c => $_) {
            $candidates[$c] = substr_count($line, $c);
        }
        arsort($candidates);
        $top = array_key_first($candidates);
        return $candidates[$top] > 0 ? $top : ';';
    }

    /**
     * @param array<int,string> $header
     * @param array<int,string> $names
     */
    private static function columnIndex(array $header, array $names): ?int
    {
        foreach ($header as $i => $h) {
            if (in_array($h, $names, true)) {
                return $i;
            }
        }
        return null;
    }

    private static function parseDate(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            throw new InvalidArgumentException('Data mancante.');
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            return $raw;
        }
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $raw, $m)) {
            return sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]);
        }
        if (preg_match('#^(\d{1,2})-(\d{1,2})-(\d{4})$#', $raw, $m)) {
            return sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]);
        }
        throw new InvalidArgumentException("Data non valida: '{$raw}'.");
    }

    private static function parseAmount(string $raw): string
    {
        $raw = trim(str_replace(['EUR', '€', ' '], '', $raw));
        if ($raw === '') {
            throw new InvalidArgumentException('Importo mancante.');
        }
        if (str_contains($raw, ',') && str_contains($raw, '.')) {
            $raw = str_replace('.', '', $raw);
            $raw = str_replace(',', '.', $raw);
        } else {
            $raw = str_replace(',', '.', $raw);
        }
        if (!is_numeric($raw)) {
            throw new InvalidArgumentException("Importo non valido: '{$raw}'.");
        }
        return $raw;
    }

    private static function parsePayment(string $raw): string
    {
        $raw = mb_strtolower(trim($raw));
        if ($raw === '') return 'card';
        if (in_array($raw, Expense::PAYMENT_METHODS, true)) {
            return $raw;
        }
        if (isset(self::PAY_LABELS_IT[$raw])) {
            return self::PAY_LABELS_IT[$raw];
        }
        throw new InvalidArgumentException("Metodo di pagamento non riconosciuto: '{$raw}'.");
    }

    private static function formatAmount(float $v): string
    {
        return number_format($v, 2, ',', '');
    }
}
