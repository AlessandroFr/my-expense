<?php
declare(strict_types=1);

namespace App;

use PDO;
use RuntimeException;
use ZipArchive;

/**
 * Genera un backup completo dei dati dell'utente: SQL dump (INSERT statements
 * scoped sul user_id) + tutti gli allegati come archivio ZIP scaricabile.
 *
 * Tabelle esportate: users, categories, accounts, contacts, tags, budgets,
 * recurring_expenses, incomes, expenses, expense_tags, expense_attachments,
 * saved_filters.
 */
final class BackupService
{
    private const TABLES_USER_SCOPED = [
        'users'              => ['user_filter' => 'id'],
        'categories'         => ['user_filter' => 'user_id'],
        'accounts'           => ['user_filter' => 'user_id'],
        'contacts'           => ['user_filter' => 'user_id'],
        'tags'               => ['user_filter' => 'user_id'],
        'budgets'            => ['user_filter' => 'user_id'],
        'recurring_expenses' => ['user_filter' => 'user_id'],
        'incomes'            => ['user_filter' => 'user_id'],
        'expenses'           => ['user_filter' => 'user_id'],
        'expense_tags'       => ['user_filter_via' => 'expenses.user_id'],
        'expense_attachments'=> ['user_filter' => 'user_id'],
        'saved_filters'      => ['user_filter' => 'user_id'],
    ];

    public static function streamBackupForUser(int $userId): void
    {
        $hasZip = class_exists(ZipArchive::class);
        $sql    = self::generateSqlDump($userId);

        if (!$hasZip) {
            $filename = 'my-expense-backup-' . date('Y-m-d') . '.sql';
            header('Content-Type: application/sql; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($sql));
            echo $sql;
            return;
        }

        $tmp = tempnam(sys_get_temp_dir(), 'mxbk_');
        if ($tmp === false) {
            throw new RuntimeException('Impossibile creare file temporaneo.');
        }

        $zip = new ZipArchive();
        if ($zip->open($tmp, ZipArchive::OVERWRITE | ZipArchive::CREATE) !== true) {
            throw new RuntimeException('Impossibile creare ZIP.');
        }

        $zip->addFromString('dump.sql', $sql);
        $zip->addFromString('README.txt', self::readme($userId));

        $uploadsDir = Attachment::uploadsRoot() . DIRECTORY_SEPARATOR . $userId;
        if (is_dir($uploadsDir)) {
            $iter = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($uploadsDir));
            foreach ($iter as $file) {
                if (!$file->isFile()) continue;
                $rel = 'uploads/' . $file->getFilename();
                $zip->addFile($file->getPathname(), $rel);
            }
        }

        $zip->close();

        $filename = 'my-expense-backup-' . date('Y-m-d') . '.zip';
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($tmp));
        readfile($tmp);
        @unlink($tmp);
    }

    private static function readme(int $userId): string
    {
        return "Backup my-expense\n"
             . "===================\n"
             . "Generato il: " . date('Y-m-d H:i:s') . "\n"
             . "User ID: " . $userId . "\n\n"
             . "Contenuto:\n"
             . " - dump.sql        INSERT statements scoped sul tuo user.\n"
             . " - uploads/        Tutti gli allegati delle tue spese.\n\n"
             . "Per ripristinare:\n"
             . " 1. Importa dump.sql nel DB my_expense via phpMyAdmin o:\n"
             . "    mysql -u root my_expense < dump.sql\n"
             . " 2. Copia la cartella uploads/ in {project_root}/uploads/expenses/{user_id}/\n";
    }

    private static function generateSqlDump(int $userId): string
    {
        $pdo = Database::pdo();
        $out = "-- my-expense backup user_id={$userId} generated " . date('c') . "\n";
        $out .= "SET FOREIGN_KEY_CHECKS=0;\n\n";

        foreach (self::TABLES_USER_SCOPED as $table => $cfg) {
            $out .= "-- Table: {$table}\n";
            $rows = self::fetchUserScoped($pdo, $userId, $table, $cfg);
            if (empty($rows)) {
                $out .= "-- (no rows)\n\n";
                continue;
            }
            $cols = array_keys($rows[0]);
            $colList = implode(', ', array_map(fn($c) => "`{$c}`", $cols));
            foreach ($rows as $r) {
                $vals = array_map(fn($v) => self::sqlValue($pdo, $v), array_values($r));
                $out .= "INSERT INTO `{$table}` ({$colList}) VALUES (" . implode(', ', $vals) . ");\n";
            }
            $out .= "\n";
        }

        $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
        return $out;
    }

    private static function fetchUserScoped(PDO $pdo, int $userId, string $table, array $cfg): array
    {
        if ($table === 'expense_tags') {
            $stmt = $pdo->prepare(
                'SELECT et.* FROM expense_tags et
                 INNER JOIN expenses e ON e.id = et.expense_id
                 WHERE e.user_id = ?'
            );
            $stmt->execute([$userId]);
            return $stmt->fetchAll();
        }
        $col = $cfg['user_filter'] ?? 'user_id';
        $stmt = $pdo->prepare("SELECT * FROM `{$table}` WHERE `{$col}` = ?");
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    private static function sqlValue(PDO $pdo, mixed $v): string
    {
        if ($v === null) return 'NULL';
        if (is_bool($v)) return $v ? '1' : '0';
        if (is_int($v) || is_float($v)) return (string) $v;
        return $pdo->quote((string) $v);
    }
}
