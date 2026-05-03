<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use RuntimeException;

/**
 * Importer per estratti conto bancari in formato Banca Sella / Patavina.
 *
 * Flusso a due step:
 *   - preview()  -> parsa il file, classifica, ritorna un array di righe
 *                   con suggerimenti (categoria, source, payment, kind, dedup
 *                   flag); NON scrive nulla.
 *   - commit()   -> riceve un array di righe (eventualmente editate dall'utente)
 *                   e scrive su DB (Expense / Income / partita doppia).
 *
 * Caratteristiche del formato sorgente:
 *   - encoding Windows-1252 (auto-converte a UTF-8)
 *   - header con metadata (intestatario, IBAN, saldi) seguito da righe vuote
 *   - tabella con header: Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate
 *   - data formato DD/MM/YYYY (sia Operazione che Valuta)
 *   - importi formato "-NN.NN €" (negativi in Uscite, positivi in Entrate)
 *
 * Idempotenza: ogni riga produce un import_hash SHA-256; sia preview() che
 * commit() ricontrollano la presenza in DB → re-import dello stesso file
 * salta automaticamente le righe gia' presenti.
 */
final class BankStatementImporter
{
    public const KIND_EXPENSE       = 'expense';
    public const KIND_INCOME        = 'income';
    public const KIND_TRANSFER_PAIR = 'transfer_pair';

    /** @var array<int,string> MCC -> categoria suggerita */
    private const MCC_MAP = [
        '5411' => 'Spesa',
        '5499' => 'Distributori automatici',
        '5541' => 'Carburante',
        '5542' => 'Carburante',
        '5655' => 'Abbigliamento',
        '5691' => 'Abbigliamento',
        '5812' => 'Ristorazione',
        '5814' => 'Ristorazione',
        '5912' => 'Farmacia',
        '5942' => 'Tempo libero',
        '5945' => 'Tempo libero',
        '5946' => 'Ottica',
        '5977' => 'Tempo libero',
        '5309' => 'Bar',
        '7011' => 'Hotel',
        '7230' => 'Cura persona',
        '7311' => 'Servizi',
        '7512' => 'Auto',
        '7523' => 'Auto',
        '7531' => 'Auto',
        '7832' => 'Tempo libero',
        '7941' => 'Sport',
        '7991' => 'Tempo libero',
        '8021' => 'Salute',
        '8062' => 'Salute',
        '8071' => 'Salute',
        '8099' => 'Salute',
        '8299' => 'Formazione',
        '4111' => 'Trasporti',
        '4131' => 'Trasporti',
        '4789' => 'Trasporti',
        '0742' => 'Veterinario',
    ];

    // ── PREVIEW ────────────────────────────────────────────────────────────
    /**
     * Parsa il file e ritorna un anteprima delle righe SENZA scrivere su DB.
     *
     * @return array{
     *   account: array{id:int, name:string},
     *   account_iban_detected: ?string,
     *   categories: array<int, array{id:int,name:string,color:string}>,
     *   skipped_empty: int,
     *   parse_errors: array<int, array{row:int, message:string}>,
     *   rows: array<int, array<string,mixed>>,
     * }
     */
    public static function preview(
        int $userId,
        int $accountId,
        string $tmpPath,
        bool $autoPairRicariche = true
    ): array {
        if (!is_uploaded_file($tmpPath) && !is_file($tmpPath)) {
            throw new InvalidArgumentException('File non valido.');
        }

        $sourceAccount = Account::findForUser($accountId, $userId);
        if ($sourceAccount === null) {
            throw new InvalidArgumentException('Conto sorgente non trovato.');
        }

        $content = self::loadAndDecode($tmpPath);
        $lines   = preg_split("/\r\n|\n|\r/", $content) ?: [];

        $headerIdx = self::findHeaderRow($lines);
        if ($headerIdx === null) {
            throw new InvalidArgumentException(
                "Header non trovato. Atteso: 'Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate'."
            );
        }

        $iban = self::extractIban(array_slice($lines, 0, $headerIdx));

        $categories = [];
        $catByName  = [];
        foreach (Category::allForUser($userId) as $c) {
            $categories[] = [
                'id'    => (int) $c['id'],
                'name'  => (string) $c['name'],
                'color' => (string) ($c['color'] ?? '#6c757d'),
            ];
            $catByName[mb_strtolower((string) $c['name'])] = (int) $c['id'];
        }

        $existingHashes = self::loadExistingHashes($userId);

        $rows         = [];
        $emptyCnt     = 0;
        $parseErrors  = [];
        $lineNum      = $headerIdx + 1;
        $idx          = 0;

        for ($i = $headerIdx + 1; $i < count($lines); $i++) {
            $lineNum++;
            $raw = $lines[$i] ?? '';
            if (trim($raw) === '') { $emptyCnt++; continue; }

            $cols = str_getcsv($raw, ';', '"', '\\');
            if (count($cols) < 6) { $emptyCnt++; continue; }

            try {
                $opDateRaw   = (string) ($cols[0] ?? '');
                $valDateRaw  = (string) ($cols[1] ?? '');
                $tipologia   = trim((string) ($cols[2] ?? ''));
                $descrizione = trim((string) ($cols[3] ?? ''));
                $uscitaRaw   = trim((string) ($cols[4] ?? ''));
                $entrataRaw  = trim((string) ($cols[5] ?? ''));

                $opDate  = self::parseItDate($opDateRaw);
                $valDate = $valDateRaw === '' ? null : self::parseItDate($valDateRaw);

                $isExpense = $uscitaRaw  !== '';
                $isIncome  = $entrataRaw !== '';
                if (!$isExpense && !$isIncome) { $emptyCnt++; continue; }
                if ($isExpense && $isIncome) {
                    throw new InvalidArgumentException('Riga con sia Uscita che Entrata: non supportato.');
                }

                $amount = $isExpense
                    ? self::parseBankAmount($uscitaRaw)
                    : self::parseBankAmount($entrataRaw);
                if ($amount <= 0) {
                    throw new InvalidArgumentException('Importo non valido (zero o negativo dopo parsing).');
                }

                $isPrepaidRecharge = $isExpense
                    && stripos($tipologia, 'Ricariche') !== false
                    && stripos($descrizione, 'RICARICA/RIMBORSO') !== false;

                $kind = $isPrepaidRecharge && $autoPairRicariche
                    ? self::KIND_TRANSFER_PAIR
                    : ($isExpense ? self::KIND_EXPENSE : self::KIND_INCOME);

                $signed = $isExpense ? -$amount : $amount;
                $hash   = self::computeImportHash($accountId, $opDate, $signed, $descrizione);

                $row = [
                    'idx'                => $idx++,
                    'csv_row'            => $lineNum,
                    'kind'               => $kind,
                    'op_date'            => $opDate,
                    'value_date'         => $valDate,
                    'tipologia'          => $tipologia,
                    'description'        => $descrizione,
                    'amount'             => round($amount, 2),
                    'is_duplicate'       => isset($existingHashes[$hash]),
                    'skip'               => isset($existingHashes[$hash]),
                    'category_id'        => null,
                    'category_suggested' => null,
                    'source'             => null,
                    'payment_method'     => null,
                ];

                if ($kind === self::KIND_EXPENSE || $kind === self::KIND_TRANSFER_PAIR) {
                    if ($kind === self::KIND_TRANSFER_PAIR) {
                        $catName = 'Trasferimenti interni';
                    } else {
                        $cls     = self::classifyExpense($tipologia, $descrizione);
                        $catName = $cls['category'];
                    }
                    $row['category_suggested'] = $catName;
                    $row['category_id']        = $catByName[mb_strtolower($catName)] ?? null;
                    $row['payment_method']     = self::guessPaymentMethod($tipologia, $descrizione);
                } else {
                    $row['source']         = self::classifyIncomeSource($tipologia, $descrizione);
                    $row['payment_method'] = null;
                }

                $rows[] = $row;
            } catch (\Throwable $e) {
                $parseErrors[] = ['row' => $lineNum, 'message' => $e->getMessage()];
            }
        }

        return [
            'account' => [
                'id'   => (int) $sourceAccount['id'],
                'name' => (string) $sourceAccount['name'],
            ],
            'account_iban_detected' => $iban,
            'categories'            => $categories,
            'skipped_empty'         => $emptyCnt,
            'parse_errors'          => $parseErrors,
            'rows'                  => $rows,
        ];
    }

    // ── COMMIT ─────────────────────────────────────────────────────────────
    /**
     * Scrive su DB le righe (potenzialmente editate dall'utente).
     *
     * @param array<int, array<string,mixed>> $rows
     * @return array{
     *   imported_expenses: int,
     *   imported_incomes:  int,
     *   transfers_paired:  int,
     *   skipped_duplicate: int,
     *   skipped_user:      int,
     *   errors: array<int, array{idx:int, message:string}>,
     * }
     */
    public static function commit(
        int $userId,
        int $accountId,
        array $rows,
        string $prepaidAccountName = 'Carta Prepagata'
    ): array {
        $sourceAccount = Account::findForUser($accountId, $userId);
        if ($sourceAccount === null) {
            throw new InvalidArgumentException('Conto sorgente non trovato.');
        }
        if ($prepaidAccountName === '') {
            $prepaidAccountName = 'Carta Prepagata';
        }

        $importedExp = 0;
        $importedInc = 0;
        $pairedCnt   = 0;
        $dupCnt      = 0;
        $skipUser    = 0;
        $errors      = [];

        $prepaidAccountId = null;

        foreach ($rows as $rowIn) {
            $idx = (int) ($rowIn['idx'] ?? -1);
            try {
                if (!empty($rowIn['skip'])) { $skipUser++; continue; }

                $kind        = (string) ($rowIn['kind'] ?? '');
                $opDate      = self::ensureIsoDate((string) ($rowIn['op_date'] ?? ''));
                $valueDate   = isset($rowIn['value_date']) && $rowIn['value_date'] !== ''
                    ? self::ensureIsoDate((string) $rowIn['value_date'])
                    : null;
                $description = trim((string) ($rowIn['description'] ?? ''));
                $amount      = self::ensurePositiveAmount($rowIn['amount'] ?? 0);

                if (!in_array($kind, [self::KIND_EXPENSE, self::KIND_INCOME, self::KIND_TRANSFER_PAIR], true)) {
                    throw new InvalidArgumentException('Tipo riga non valido.');
                }

                if ($kind === self::KIND_TRANSFER_PAIR) {
                    if ($prepaidAccountId === null) {
                        $prepaidAccountId = self::resolvePrepaidAccount($userId, $prepaidAccountName);
                    }
                    if ($prepaidAccountId === $accountId) {
                        throw new InvalidArgumentException(
                            "Il conto sorgente coincide con '{$prepaidAccountName}': impossibile fare partita doppia."
                        );
                    }
                    $catId = isset($rowIn['category_id']) && $rowIn['category_id'] !== ''
                        ? (int) $rowIn['category_id']
                        : null;

                    $signed   = -$amount;
                    $baseHash = self::computeImportHash($accountId, $opDate, $signed, $description);
                    $expHash  = $baseHash . ':exp';
                    $incHash  = $baseHash . ':inc';

                    $expId = Expense::createImported(
                        $userId, $catId, (string) $amount,
                        'Ricarica → ' . $prepaidAccountName,
                        'transfer', $opDate, $accountId, $valueDate, $expHash
                    );
                    $incId = Income::createImported(
                        $userId, 'Trasferimento da conto',
                        'Ricarica da ' . (string) ($sourceAccount['name'] ?? 'conto'),
                        (string) $amount, $opDate, $prepaidAccountId, $valueDate, $incHash
                    );
                    if ($expId === null && $incId === null) {
                        $dupCnt++;
                    } else {
                        $pairedCnt++;
                        $importedExp += ($expId !== null ? 1 : 0);
                        $importedInc += ($incId !== null ? 1 : 0);
                    }
                    continue;
                }

                if ($kind === self::KIND_EXPENSE) {
                    $catId = isset($rowIn['category_id']) && $rowIn['category_id'] !== ''
                        ? (int) $rowIn['category_id']
                        : null;
                    $payment = (string) ($rowIn['payment_method'] ?? 'card');
                    $signed  = -$amount;
                    $hash    = self::computeImportHash($accountId, $opDate, $signed, $description);

                    $id = Expense::createImported(
                        $userId, $catId, (string) $amount, $description,
                        $payment, $opDate, $accountId, $valueDate, $hash
                    );
                    if ($id === null) $dupCnt++; else $importedExp++;
                } else {
                    $source = trim((string) ($rowIn['source'] ?? ''));
                    if ($source === '') $source = 'Entrata';
                    $hash = self::computeImportHash($accountId, $opDate, $amount, $description);

                    $id = Income::createImported(
                        $userId, $source, $description, (string) $amount,
                        $opDate, $accountId, $valueDate, $hash
                    );
                    if ($id === null) $dupCnt++; else $importedInc++;
                }
            } catch (\Throwable $e) {
                $errors[] = ['idx' => $idx, 'message' => $e->getMessage()];
            }
        }

        return [
            'imported_expenses' => $importedExp,
            'imported_incomes'  => $importedInc,
            'transfers_paired'  => $pairedCnt,
            'skipped_duplicate' => $dupCnt,
            'skipped_user'      => $skipUser,
            'errors'            => $errors,
        ];
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /** @return array<string, true> */
    private static function loadExistingHashes(int $userId): array
    {
        $out = [];
        $pdo = Database::pdo();
        $stmt = $pdo->prepare('SELECT import_hash FROM expenses WHERE user_id = ? AND import_hash IS NOT NULL');
        $stmt->execute([$userId]);
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['import_hash']] = true;
        }
        $stmt = $pdo->prepare('SELECT import_hash FROM incomes WHERE user_id = ? AND import_hash IS NOT NULL');
        $stmt->execute([$userId]);
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['import_hash']] = true;
        }
        return $out;
    }

    private static function ensureIsoDate(string $s): string
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
            throw new InvalidArgumentException("Data non valida: '{$s}' (atteso YYYY-MM-DD).");
        }
        return $s;
    }

    private static function ensurePositiveAmount(mixed $v): float
    {
        $f = is_string($v) ? (float) str_replace(',', '.', $v) : (float) $v;
        if ($f <= 0 || !is_finite($f)) {
            throw new InvalidArgumentException('Importo non valido.');
        }
        return round($f, 2);
    }

    private static function loadAndDecode(string $path): string
    {
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new RuntimeException('Impossibile leggere il file.');
        }
        if (str_starts_with($raw, "\xEF\xBB\xBF")) {
            $raw = substr($raw, 3);
        }
        if (!mb_check_encoding($raw, 'UTF-8')) {
            $converted = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');
            if ($converted === false) {
                throw new RuntimeException('Conversione encoding fallita.');
            }
            $raw = $converted;
        }
        return $raw;
    }

    /** @param array<int,string> $lines */
    private static function findHeaderRow(array $lines): ?int
    {
        foreach ($lines as $i => $line) {
            $low = mb_strtolower($line);
            if (str_contains($low, 'operazione')
                && str_contains($low, 'valuta')
                && (str_contains($low, 'uscite') || str_contains($low, 'entrate'))
            ) {
                return $i;
            }
        }
        return null;
    }

    /** @param array<int,string> $preHeaderLines */
    private static function extractIban(array $preHeaderLines): ?string
    {
        foreach ($preHeaderLines as $line) {
            if (preg_match('/(IT\d{2}[A-Z]\d{22})/', $line, $m)) {
                return $m[1];
            }
        }
        return null;
    }

    private static function parseItDate(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            throw new InvalidArgumentException('Data mancante.');
        }
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $raw, $m)) {
            return sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]);
        }
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{2})$#', $raw, $m)) {
            $year = (int) $m[3];
            $year += $year >= 70 ? 1900 : 2000;
            return sprintf('%04d-%02d-%02d', $year, (int) $m[2], (int) $m[1]);
        }
        throw new InvalidArgumentException("Data non valida: '{$raw}'.");
    }

    private static function parseBankAmount(string $raw): float
    {
        $clean = preg_replace('/[\x{20AC}\x{00A0}\s]/u', '', $raw) ?? '';
        $clean = str_replace(['EUR', '€'], '', $clean);
        $clean = trim($clean);
        if ($clean === '') {
            throw new InvalidArgumentException('Importo vuoto.');
        }

        $negative = false;
        if (str_starts_with($clean, '-')) {
            $negative = true;
            $clean = substr($clean, 1);
        } elseif (str_starts_with($clean, '+')) {
            $clean = substr($clean, 1);
        }

        $hasDot   = str_contains($clean, '.');
        $hasComma = str_contains($clean, ',');
        if ($hasDot && $hasComma) {
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        } elseif ($hasComma && !$hasDot) {
            $clean = str_replace(',', '.', $clean);
        }

        if (!is_numeric($clean)) {
            throw new InvalidArgumentException("Importo non valido: '{$raw}'.");
        }
        $val = (float) $clean;
        return $negative ? abs($val) : $val;
    }

    private static function computeImportHash(int $accountId, string $opDate, float $signedAmount, string $desc): string
    {
        $normDesc = preg_replace('/\s+/', ' ', mb_strtolower(trim($desc))) ?? $desc;
        $key = $accountId . '|' . $opDate . '|' . number_format($signedAmount, 2, '.', '') . '|' . mb_substr($normDesc, 0, 120);
        return hash('sha256', $key);
    }

    /** @return array{category: string} */
    private static function classifyExpense(string $tipologia, string $descrizione): array
    {
        $tlow = mb_strtolower($tipologia);

        if (str_contains($tlow, 'stipendi'))      return ['category' => 'Trasferimenti'];
        if (str_contains($tlow, 'bonifici'))      return ['category' => 'Bonifici'];
        if (str_contains($tlow, 'bancomat pay'))  return ['category' => 'P2P'];
        if (str_contains($tlow, 'addebiti diretti')) {
            $cat = stripos($descrizione, 'AMAZON') !== false ? 'Acquisti online' : 'Addebiti SDD';
            return ['category' => $cat];
        }
        if (str_contains($tlow, 'bollettini'))    return ['category' => 'Utenze'];
        if (str_contains($tlow, 'ricariche'))     return ['category' => 'Commissioni bancarie'];

        if (preg_match('/COD\.\s*MCC\s*(\d{4})/i', $descrizione, $m)) {
            $mcc = $m[1];
            if (isset(self::MCC_MAP[$mcc])) {
                return ['category' => self::MCC_MAP[$mcc]];
            }
        }
        if (stripos($descrizione, 'PRELIEVO DI CONTANTE') !== false) {
            return ['category' => 'Prelievo contante'];
        }
        return ['category' => 'Pagamenti'];
    }

    private static function classifyIncomeSource(string $tipologia, string $descrizione): string
    {
        $tlow = mb_strtolower($tipologia);
        if (str_contains($tlow, 'stipendi'))     return 'Stipendio';
        if (str_contains($tlow, 'bancomat pay')) return 'P2P';
        if (str_contains($tlow, 'bonifici')) {
            if (preg_match('/\bDA\s+([A-Z][A-Z\s\.\']+?)(?:\s+NOTE:|\s+VAL\.|\s+DATA|\s+CRO|$)/u', $descrizione, $m)) {
                $name = trim($m[1]);
                if ($name !== '' && mb_strlen($name) <= 60) {
                    return 'Bonifico da ' . ucwords(mb_strtolower($name));
                }
            }
            return 'Bonifico';
        }
        return 'Entrata';
    }

    private static function guessPaymentMethod(string $tipologia, string $descrizione): string
    {
        $tlow = mb_strtolower($tipologia);
        if (str_contains($tlow, 'bonifici'))         return 'transfer';
        if (str_contains($tlow, 'bollettini') || str_contains($tlow, 'addebiti diretti')) return 'transfer';
        if (str_contains($tlow, 'bancomat pay'))     return 'transfer';
        if (str_contains($tlow, 'ricariche'))        return 'transfer';
        if (stripos($descrizione, 'PRELIEVO DI CONTANTE') !== false) return 'cash';
        return 'card';
    }

    private static function resolvePrepaidAccount(int $userId, string $name): int
    {
        foreach (Account::allForUser($userId, true) as $a) {
            if (mb_strtolower((string) $a['name']) === mb_strtolower($name)) {
                return (int) $a['id'];
            }
        }
        return Account::create($userId, $name, 'card', '#9c27b0', 'credit-card', '0.00', 100);
    }
}
