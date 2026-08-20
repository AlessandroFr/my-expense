<?php
declare(strict_types=1);

namespace App;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $cfg  = Config::get('db');
        $path = (string) ($cfg['path'] ?? 'data/my-expense.sqlite');

        // Path relativo = relativo alla root del progetto, cosi' la config non
        // dipende dalla directory da cui e' stato lanciato il processo.
        if (!preg_match('#^([a-zA-Z]:[\\\\/]|[\\\\/])#', $path)) {
            $path = dirname(__DIR__, 2) . '/' . $path;
        }

        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0777, true) && !is_dir($dir)) {
            throw new RuntimeException("Impossibile creare la cartella del database: {$dir}");
        }

        try {
            self::$pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            throw new RuntimeException('Connessione DB fallita: ' . $e->getMessage(), 0, $e);
        }

        // In SQLite le foreign key sono DISATTIVATE di default: senza questa riga
        // tutte le FK dello schema smetterebbero di valere in silenzio.
        self::$pdo->exec('PRAGMA foreign_keys = ON');
        // WAL: letture e scritture non si bloccano a vicenda.
        self::$pdo->exec('PRAGMA journal_mode = WAL');

        return self::$pdo;
    }
}
