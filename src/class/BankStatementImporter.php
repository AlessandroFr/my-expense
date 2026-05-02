<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use RuntimeException;

/**
 * Importer per estratti conto bancari in formato Banca Sella / Patavina.
 *
 * Caratteristiche del formato:
 *   - encoding Windows-1252 (auto-converte a UTF-8)
 *   - header con metadata (intestatario, IBAN, saldi) seguito da righe vuote
 *   - tabella con header: Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate
 *   - data formato DD/MM/YYYY (sia Operazione che Valuta)
 *   - importi formato "-NN.NN €" (negativi in Uscite, positivi in Entrate)
 *
 * Routing per riga:
 *   - Uscite valorizzata  -> crea Expense
 *   - Entrate valorizzata -> crea Income
 *   - Tipologia "Ricariche" + descrizione "RICARICA/RIMBORSO CARTA/E PREPAGATA/E"
 *     opzionalmente genera partita doppia: expense sul conto + income sull'account
 *     "Carta Prepagata" (auto-creato se mancante).
 *
 * Idempotenza: ogni riga produce un import_hash SHA-256; re-import dello stesso
 * file salta automaticamente le righe gia' presenti.
 */
final class BankStatementImporter
{
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

    /**
     * @return array{
     *   imported_expenses: int,
     *   imported_incomes:  int,
     *   transfers_paired:  int,
     *   skipped_duplicate: int,
     *   skipped_empty:     int,
     *   errors: array<int, array{row:int, message:string}>,
     *   account_iban_detected: ?string
     * }
     */
    public static function importFromUpload(
        int $userId,
        int $accountId,
        string $tmpPath,
        bool $createMissingCategories = true,
        bool $autoPairRicariche = true,
        string $prepaidAccountName = 'Carta Prepagata'
    ): array {
        if (!is_uploaded_file($tmpPath) && !is_file($tmpPath)) {
            throw new InvalidArgumentException('File non valido.');
        }

        // Verifica account appartiene all'utente.
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

        // Carica cache categorie (lowercase -> id).
        $catCache = [];
        foreach (Category::allForUser($userId) as $c) {
            $catCache[mb_strtolower((string) $c['name'])] = (int) $c['id'];
        }

        // Lazy lookup/create del conto prepagato (solo se servira').
        $prepaidAccountId = null;

        $importedExp = 0;
        $importedInc = 0;
        $pairedCnt   = 0;
        $dupCnt      = 0;
        $emptyCnt    = 0;
        $errors      = [];
        $lineNum     = $headerIdx + 1; // riga header (1-based)

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

                // Rilevamento ricarica carta prepagata (solo lato Uscita).
                $isPrepaidRecharge = $isExpense
                    && stripos($tipologia, 'Ricariche') !== false
                    && stripos($descrizione, 'RICARICA/RIMBORSO') !== false;

                $signed     = $isExpense ? -$amount : $amount;
                $importHash = self::computeImportHash($accountId, $opDate, $signed, $descrizione);

                if ($isPrepaidRecharge && $autoPairRicariche) {
                    // Lazy-init account prepagato.
                    if ($prepaidAccountId === null) {
                        $prepaidAccountId = self::resolvePrepaidAccount($userId, $prepaidAccountName);
                    }
                    if ($prepaidAccountId === $accountId) {
                        throw new InvalidArgumentException(
                            "Il conto sorgente coincide con '{$prepaidAccountName}': impossibile fare partita doppia."
                        );
                    }

                    $catId = self::resolveCategoryId('Trasferimenti interni', $catCache, $userId, $createMissingCategories);

                    $expHash = $importHash . ':exp';
                    $incHash = $importHash . ':inc';

                    $expId = Expense::createImported(
                        $userId, $catId, (string) $amount,
                        'Ricarica → ' . $prepaidAccountName,
                        'transfer', $opDate, $accountId, $valDate, $expHash
                    );
                    $incId = Income::createImported(
                        $userId, 'Trasferimento da conto',
                        'Ricarica da ' . (string) ($sourceAccount['name'] ?? 'conto'),
                        (string) $amount, $opDate, $prepaidAccountId, $valDate, $incHash
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

                if ($isExpense) {
                    $classification = self::classifyExpense($tipologia, $descrizione);
                    $catId = self::resolveCategoryId(
                        $classification['category'], $catCache, $userId, $createMissingCategories
                    );
                    $payment = self::guessPaymentMethod($tipologia, $descrizione);

                    $id = Expense::createImported(
                        $userId, $catId, (string) $amount, $descrizione,
                        $payment, $opDate, $accountId, $valDate, $importHash
                    );
                    if ($id === null) {
                        $dupCnt++;
                    } else {
                        $importedExp++;
                    }
                } else {
                    $source = self::classifyIncomeSource($tipologia, $descrizione);
                    $id = Income::createImported(
                        $userId, $source, $descrizione, (string) $amount,
                        $opDate, $accountId, $valDate, $importHash
                    );
                    if ($id === null) {
                        $dupCnt++;
                    } else {
                        $importedInc++;
                    }
                }
            } catch (\Throwable $e) {
                $errors[] = ['row' => $lineNum, 'message' => $e->getMessage()];
            }
        }

        return [
            'imported_expenses'     => $importedExp,
            'imported_incomes'      => $importedInc,
            'transfers_paired'      => $pairedCnt,
            'skipped_duplicate'     => $dupCnt,
            'skipped_empty'         => $emptyCnt,
            'errors'                => $errors,
            'account_iban_detected' => $iban,
        ];
    }

    // ── Pipeline helpers ──────────────────────────────────────────────────

    private static function loadAndDecode(string $path): string
    {
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new RuntimeException('Impossibile leggere il file.');
        }
        // Strip BOM se presente.
        if (str_starts_with($raw, "\xEF\xBB\xBF")) {
            $raw = substr($raw, 3);
        }
        // Auto-detect encoding: se non e' UTF-8 valido lo trattiamo come Windows-1252.
        if (!mb_check_encoding($raw, 'UTF-8')) {
            $converted = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');
            if ($converted === false) {
                throw new RuntimeException('Conversione encoding fallita.');
            }
            $raw = $converted;
        }
        return $raw;
    }

    /**
     * @param array<int,string> $lines
     */
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

    /**
     * @param array<int,string> $preHeaderLines
     */
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

    /**
     * Parsa un importo in formato Banca Sella: "-298.00 €" o "5.039,56 €".
     * Per le transazioni il punto e' separatore decimale; per il saldo
     * l'italiano usa virgola decimale + punto migliaia.
     * Ritorna sempre il valore assoluto (segno gestito a monte).
     */
    private static function parseBankAmount(string $raw): float
    {
        // Rimuovi simbolo €, byte NBSP, spazi normali, byte di controllo CP1252 residui.
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
            // Formato italiano "5.039,56" -> punto = migliaia, virgola = decimale.
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        } elseif ($hasComma && !$hasDot) {
            // Solo virgola: e' decimale.
            $clean = str_replace(',', '.', $clean);
        }
        // Solo punto, o nessuno: gia' OK.

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

    /**
     * @return array{category: string}
     */
    private static function classifyExpense(string $tipologia, string $descrizione): array
    {
        $tlow = mb_strtolower($tipologia);

        if (str_contains($tlow, 'stipendi')) {
            return ['category' => 'Trasferimenti']; // raro lato uscita
        }
        if (str_contains($tlow, 'bonifici')) {
            return ['category' => 'Bonifici'];
        }
        if (str_contains($tlow, 'bancomat pay')) {
            return ['category' => 'P2P'];
        }
        if (str_contains($tlow, 'addebiti diretti')) {
            $cat = stripos($descrizione, 'AMAZON') !== false ? 'Acquisti online' : 'Addebiti SDD';
            return ['category' => $cat];
        }
        if (str_contains($tlow, 'bollettini')) {
            return ['category' => 'Utenze'];
        }
        if (str_contains($tlow, 'ricariche')) {
            // Solo le commissioni 1€ arrivano qui (le ricariche vere sono gia' state pairate).
            return ['category' => 'Commissioni bancarie'];
        }

        // Tenta MCC dalla descrizione.
        if (preg_match('/COD\.\s*MCC\s*(\d{4})/i', $descrizione, $m)) {
            $mcc = $m[1];
            if (isset(self::MCC_MAP[$mcc])) {
                return ['category' => self::MCC_MAP[$mcc]];
            }
        }
        // Prelievo contante puro (no MCC ma "PRELIEVO DI CONTANTE").
        if (stripos($descrizione, 'PRELIEVO DI CONTANTE') !== false) {
            return ['category' => 'Prelievo contante'];
        }
        return ['category' => 'Pagamenti'];
    }

    private static function classifyIncomeSource(string $tipologia, string $descrizione): string
    {
        $tlow = mb_strtolower($tipologia);
        if (str_contains($tlow, 'stipendi')) return 'Stipendio';
        if (str_contains($tlow, 'bancomat pay')) return 'P2P';
        if (str_contains($tlow, 'bonifici')) {
            // Estrai "DA <NOME>" se presente nella descrizione.
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
        if (str_contains($tlow, 'bonifici')) return 'transfer';
        if (str_contains($tlow, 'bollettini') || str_contains($tlow, 'addebiti diretti')) return 'transfer';
        if (str_contains($tlow, 'bancomat pay')) return 'transfer';
        if (str_contains($tlow, 'ricariche')) return 'transfer';
        if (stripos($descrizione, 'PRELIEVO DI CONTANTE') !== false) return 'cash';
        return 'card';
    }

    /**
     * @param array<string,int> $catCache modificato per riferimento
     */
    private static function resolveCategoryId(
        string $name,
        array &$catCache,
        int $userId,
        bool $createMissing
    ): ?int {
        $name = trim($name);
        if ($name === '') return null;
        $key = mb_strtolower($name);
        if (isset($catCache[$key])) {
            return $catCache[$key];
        }
        if (!$createMissing) {
            return null;
        }
        $id = Category::create($userId, $name, '#6c757d', null, 0);
        $catCache[$key] = $id;
        return $id;
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
