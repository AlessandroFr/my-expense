<?php
declare(strict_types=1);

namespace App;

use Throwable;

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
    public const ERR_VALIDATION = 'validation_error';
    public const ERR_UNAUTH     = 'unauthenticated';
    public const ERR_FORBIDDEN  = 'forbidden';
    public const ERR_CSRF       = 'csrf';
    public const ERR_NOT_FOUND  = 'not_found';
    public const ERR_CONFLICT   = 'conflict';
    public const ERR_SERVER     = 'server_error';

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
    public static function error(string $message, string $code = self::ERR_VALIDATION, int $status = 400, ?array $details = null): void
    {
        $error = ['code' => $code, 'message' => $message];
        if ($details !== null) {
            $error['details'] = $details;
        }
        self::send($status, ['ok' => false, 'error' => $error]);
    }

    /**
     * Errore server: logga la traccia completa su error_log e ritorna un messaggio
     * generico al client (mai PDO/SQL/stack al browser).
     */
    public static function serverError(Throwable $e, string $publicMessage = 'Errore server interno.'): void
    {
        error_log('[my-expense] ' . $e::class . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString());
        self::error($publicMessage, self::ERR_SERVER, 500);
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
