<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDO;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Ripristina i dati di un utente a partire da un backup prodotto da
 * App\BackupService — accetta sia ZIP (dump.sql + uploads/) sia plain .sql.
 *
 * Strategia:
 *  1) Detect format e validazione (estensione, dimensione max 64 MB,
 *     entries dello ZIP whitelisted contro path traversal).
 *  2) Wipe completo dei dati dell'utente loggato via DatabaseReset (la riga
 *     `users` resta intatta — preserva credenziali correnti).
 *  3) Parse del dump line-by-line, skip della tabella `users`, riscrittura
 *     della colonna `user_id` con l'ID dell'utente loggato (consente import
 *     da altra installazione), execute in singola transazione con
 *     foreign key spente. Rollback completo su qualsiasi eccezione.
 *  4) Post-commit, estrazione degli allegati dallo ZIP nella directory
 *     uploads/expenses/{user_id}/ (best-effort, errori loggati).
 */
final class BackupRestoreService
{
    public const MAX_BYTES = 64 * 1024 * 1024;

    /** Tabelle accettate nel dump — `users` è esclusa di proposito. */
    private const ALLOWED_TABLES = [
        'categories',
        'accounts',
        'contacts',
        'tags',
        'budgets',
        'recurring_expenses',
        'incomes',
        'expenses',
        'expense_tags',
        'expense_attachments',
        'saved_filters',
    ];

    /**
     * @return array{
     *   rows_per_table: array<string,int>,
     *   files_extracted: int,
     *   skipped: int
     * }
     */
    public static function restoreForUser(int $userId, string $tmpPath, string $origName): array
    {
        if ($userId <= 0) {
            throw new InvalidArgumentException('User ID non valido.');
        }
        if (!is_file($tmpPath) || !is_readable($tmpPath)) {
            throw new InvalidArgumentException('File caricato non leggibile.');
        }
        $size = filesize($tmpPath);
        if ($size === false || $size <= 0) {
            throw new InvalidArgumentException('File caricato vuoto.');
        }
        if ($size > self::MAX_BYTES) {
            throw new InvalidArgumentException('File troppo grande (max 64 MB).');
        }

        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        if ($ext !== 'zip' && $ext !== 'sql') {
            throw new InvalidArgumentException('Sono accettati solo file .zip o .sql.');
        }

        // ── Estrazione dump + raccolta entries uploads ────────────────────
        $sqlDump   = '';
        $zip       = null;
        $uploadEnt = []; // array di entry name dentro lo ZIP

        if ($ext === 'zip') {
            if (!class_exists(ZipArchive::class)) {
                throw new RuntimeException('Estensione ZipArchive non disponibile sul server.');
            }
            $zip = new ZipArchive();
            if ($zip->open($tmpPath, ZipArchive::RDONLY) !== true) {
                throw new InvalidArgumentException('Archivio ZIP non valido o corrotto.');
            }

            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if ($name === false || $name === '') continue;
                self::assertSafeEntryName($name);

                if ($name === 'dump.sql') {
                    $sqlDump = (string) $zip->getFromIndex($i);
                    continue;
                }
                if ($name === 'README.txt') {
                    continue;
                }
                if (str_starts_with($name, 'uploads/')) {
                    $rel = substr($name, strlen('uploads/'));
                    if ($rel === '' || str_contains($rel, '/') || str_contains($rel, '\\')) {
                        continue;
                    }
                    $uploadEnt[] = $name;
                }
            }

            if ($sqlDump === '') {
                $zip->close();
                throw new InvalidArgumentException('Lo ZIP non contiene dump.sql.');
            }
        } else {
            $contents = file_get_contents($tmpPath);
            if ($contents === false) {
                throw new RuntimeException('Impossibile leggere il file SQL.');
            }
            $sqlDump = $contents;
        }

        if (stripos($sqlDump, 'INSERT INTO') === false) {
            if ($zip !== null) $zip->close();
            throw new InvalidArgumentException('Il dump non contiene INSERT statements.');
        }

        // ── Wipe dati utente (preserva la riga users) ─────────────────────
        DatabaseReset::execute($userId, DatabaseReset::SCOPE_ALL);

        // ── Esecuzione INSERT in transazione singola ──────────────────────
        $pdo = Database::pdo();
        $counters = self::parseAndExecute($pdo, $sqlDump, $userId);

        // ── Post-commit: estrazione uploads ───────────────────────────────
        $filesExtracted = 0;
        if ($zip !== null && !empty($uploadEnt)) {
            $destDir = Attachment::uploadsRoot() . DIRECTORY_SEPARATOR . $userId;
            if (!is_dir($destDir)) {
                @mkdir($destDir, 0755, true);
            }
            foreach ($uploadEnt as $entry) {
                $basename = basename(substr($entry, strlen('uploads/')));
                if ($basename === '') continue;
                $stream = $zip->getStream($entry);
                if (!$stream) continue;
                $destPath = $destDir . DIRECTORY_SEPARATOR . $basename;
                $out = @fopen($destPath, 'wb');
                if (!$out) {
                    fclose($stream);
                    error_log('[my-expense] restore: impossibile scrivere ' . $destPath);
                    continue;
                }
                while (!feof($stream)) {
                    $chunk = fread($stream, 65536);
                    if ($chunk === false) break;
                    fwrite($out, $chunk);
                }
                fclose($stream);
                fclose($out);
                $filesExtracted++;
            }
        }

        if ($zip !== null) $zip->close();

        return [
            'rows_per_table'  => $counters['rows_per_table'],
            'files_extracted' => $filesExtracted,
            'skipped'         => $counters['skipped'],
        ];
    }

    /**
     * Parsa il dump e esegue le INSERT in una singola transazione.
     * Su qualsiasi eccezione: rollback, ripristino FK_CHECKS, rilancia.
     *
     * @return array{rows_per_table: array<string,int>, skipped: int}
     */
    private static function parseAndExecute(PDO $pdo, string $sql, int $userId): array
    {
        $rows    = array_fill_keys(self::ALLOWED_TABLES, 0);
        $skipped = 0;

        $pdo->exec('PRAGMA foreign_keys = OFF');
        $pdo->beginTransaction();

        try {
            $lines = preg_split("/\r?\n/", $sql);
            if ($lines === false) {
                throw new RuntimeException('Impossibile splittare il dump.');
            }

            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '--')) continue;
                if (stripos($line, 'PRAGMA foreign_keys') === 0) continue;
                if (stripos($line, 'INSERT INTO') !== 0) continue;

                if (!preg_match(
                    '/^INSERT INTO `([^`]+)` \(([^)]+)\) VALUES \((.*)\);\s*$/s',
                    $line,
                    $m
                )) {
                    $skipped++;
                    continue;
                }

                $table   = $m[1];
                $colsRaw = $m[2];
                $valsRaw = $m[3];

                if ($table === 'users') {
                    $skipped++;
                    continue;
                }
                if (!in_array($table, self::ALLOWED_TABLES, true)) {
                    $skipped++;
                    continue;
                }

                $cols = array_map(
                    static fn(string $c): string => trim($c, " `\t"),
                    explode(',', $colsRaw)
                );
                $vals = self::tokenizeValues($valsRaw);

                if (count($cols) !== count($vals)) {
                    throw new RuntimeException(
                        'Mismatch colonne/valori su tabella ' . $table
                        . ' (' . count($cols) . ' vs ' . count($vals) . ').'
                    );
                }

                $uidIdx = array_search('user_id', $cols, true);
                if ($uidIdx !== false) {
                    $vals[$uidIdx] = (string) $userId;
                }

                $rebuilt = "INSERT INTO `{$table}` (`" . implode('`,`', $cols) . "`) VALUES ("
                    . implode(',', $vals) . ")";
                $pdo->exec($rebuilt);
                $rows[$table]++;
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $pdo->exec('PRAGMA foreign_keys = ON');
            throw $e;
        }

        $pdo->exec('PRAGMA foreign_keys = ON');

        return ['rows_per_table' => $rows, 'skipped' => $skipped];
    }

    /**
     * Tokenizer state-machine per la lista VALUES di una INSERT.
     * Splitta sulle virgole top-level, mantenendo intatti gli apici esterni
     * delle stringhe — non re-quota nulla, i valori sono già escaped al
     * backup time tramite PDO::quote().
     *
     * @return array<int,string>
     */
    private static function tokenizeValues(string $s): array
    {
        $out   = [];
        $buf   = '';
        $inStr = false;
        $i     = 0;
        $n     = strlen($s);

        while ($i < $n) {
            $c = $s[$i];

            if ($inStr) {
                if ($c === "'" && $i + 1 < $n && $s[$i + 1] === "'") {
                    $buf .= "''";
                    $i += 2;
                    continue;
                }
                if ($c === "\\" && $i + 1 < $n) {
                    $buf .= $c . $s[$i + 1];
                    $i += 2;
                    continue;
                }
                $buf .= $c;
                if ($c === "'") {
                    $inStr = false;
                }
                $i++;
                continue;
            }

            if ($c === "'") {
                $inStr = true;
                $buf .= $c;
                $i++;
                continue;
            }
            if ($c === ',') {
                $out[] = trim($buf);
                $buf   = '';
                $i++;
                continue;
            }
            $buf .= $c;
            $i++;
        }

        if (trim($buf) !== '') {
            $out[] = trim($buf);
        }
        return $out;
    }

    /**
     * Valida il nome di un'entry ZIP contro path traversal e nomi assoluti.
     */
    private static function assertSafeEntryName(string $name): void
    {
        if (str_contains($name, '..')) {
            throw new InvalidArgumentException('Archivio ZIP rifiutato: contiene path traversal.');
        }
        if (str_starts_with($name, '/') || str_starts_with($name, '\\')) {
            throw new InvalidArgumentException('Archivio ZIP rifiutato: percorso assoluto.');
        }
        if (preg_match('/^[a-zA-Z]:[\\\\\/]/', $name)) {
            throw new InvalidArgumentException('Archivio ZIP rifiutato: drive letter.');
        }
    }
}
