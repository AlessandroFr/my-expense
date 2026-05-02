<?php
declare(strict_types=1);

namespace App;

use RuntimeException;

final class Config
{
    private static ?array $data = null;

    public static function load(string $path): void
    {
        if (!is_file($path)) {
            throw new RuntimeException(
                "Config file non trovato: {$path}. Copia config/config.example.php in config/config.php."
            );
        }
        $data = require $path;
        if (!is_array($data)) {
            throw new RuntimeException("Config file deve restituire un array: {$path}");
        }
        self::$data = $data;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        if (self::$data === null) {
            throw new RuntimeException('Config non inizializzata. Chiama Config::load() prima.');
        }
        return self::$data[$key] ?? $default;
    }
}
