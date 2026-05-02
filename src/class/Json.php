<?php
declare(strict_types=1);

namespace App;

/**
 * JSON envelope helper.
 *
 * Successo: { ok: true, data: {...} }
 * Errore:   { ok: false, error: { code, message, details? } }
 *
 * Compatibile con `componentBase.js::normalizeApiResponse`.
 */
final class Json
{
    /**
     * @param array<string,mixed> $data
     */
    public static function ok(array $data = [], int $status = 200): void
    {
        self::send($status, ['ok' => true, 'data' => $data]);
    }

    /**
     * @param array<string,mixed>|null $details
     */
    public static function error(string $message, string $code = 'generic', int $status = 400, ?array $details = null): void
    {
        $error = ['code' => $code, 'message' => $message];
        if ($details !== null) {
            $error['details'] = $details;
        }
        self::send($status, ['ok' => false, 'error' => $error]);
    }

    /**
     * @param array<string,mixed> $payload
     */
    private static function send(int $status, array $payload): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}
