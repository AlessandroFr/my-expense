<?php
declare(strict_types=1);

namespace App\Http;

use RuntimeException;

/**
 * Eccezione HTTP con status code + codice envelope.
 * Catturata dal Kernel e convertita in Response::json o Response::view secondo il contesto.
 */
class HttpException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message = '',
        public readonly ?array $details = null,
    ) {
        parent::__construct($message);
    }

    public static function badRequest(string $message, ?array $details = null): self
    {
        return new self(400, 'validation_error', $message, $details);
    }

    public static function unauthorized(string $message = 'Autenticazione richiesta.'): self
    {
        return new self(401, 'unauthenticated', $message);
    }

    public static function forbidden(string $message = 'Accesso negato.'): self
    {
        return new self(403, 'forbidden', $message);
    }

    public static function csrf(string $message = 'CSRF token non valido.'): self
    {
        return new self(403, 'csrf', $message);
    }

    public static function notFound(string $message = 'Risorsa non trovata.'): self
    {
        return new self(404, 'not_found', $message);
    }

    public static function conflict(string $message): self
    {
        return new self(409, 'conflict', $message);
    }

    public static function unprocessable(string $message, ?array $details = null): self
    {
        return new self(422, 'validation_error', $message, $details);
    }
}
