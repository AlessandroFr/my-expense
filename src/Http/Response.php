<?php
declare(strict_types=1);

namespace App\Http;

use Closure;

/**
 * Oggetto Response restituito dai Controller e dai Middleware.
 * Il Kernel chiama send() in coda al dispatch.
 *
 * Mantiene gli stessi codici envelope di App\Json (validation_error,
 * unauthenticated, csrf, forbidden, not_found, conflict, server_error)
 * per non rompere componentBase.js::normalizeApiResponse.
 */
final class Response
{
    public const ERR_VALIDATION = 'validation_error';
    public const ERR_UNAUTH     = 'unauthenticated';
    public const ERR_FORBIDDEN  = 'forbidden';
    public const ERR_CSRF       = 'csrf';
    public const ERR_NOT_FOUND  = 'not_found';
    public const ERR_CONFLICT   = 'conflict';
    public const ERR_SERVER     = 'server_error';

    /** @var array<string,string> */
    private array $headers = [];

    /** @var Closure|null */
    private $streamCallback = null;

    private string $body = '';

    private function __construct(public int $status = 200)
    {
    }

    /**
     * @param array<string,mixed> $data
     */
    public static function json(array $data, int $status = 200): self
    {
        $r = new self($status);
        $r->headers['Content-Type']  = 'application/json; charset=utf-8';
        $r->headers['Cache-Control'] = 'no-store';
        $r->body = json_encode(
            ['ok' => true, 'data' => $data],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) ?: '{"ok":true,"data":{}}';
        return $r;
    }

    /**
     * @param array<string,mixed>|null $details
     */
    public static function error(string $message, string $code = self::ERR_VALIDATION, int $status = 400, ?array $details = null): self
    {
        $error = ['code' => $code, 'message' => $message];
        if ($details !== null) {
            $error['details'] = $details;
        }
        $r = new self($status);
        $r->headers['Content-Type']  = 'application/json; charset=utf-8';
        $r->headers['Cache-Control'] = 'no-store';
        $r->body = json_encode(
            ['ok' => false, 'error' => $error],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) ?: '{"ok":false,"error":{"code":"server_error"}}';
        return $r;
    }

    public static function html(string $body, int $status = 200): self
    {
        $r = new self($status);
        $r->headers['Content-Type'] = 'text/html; charset=utf-8';
        $r->body = $body;
        return $r;
    }

    public static function redirect(string $url, int $status = 302): self
    {
        $r = new self($status);
        $r->headers['Location'] = $url;
        return $r;
    }

    public static function noContent(int $status = 204): self
    {
        return new self($status);
    }

    /**
     * Risposta streamed: il callback viene invocato in send() ed e' responsabile
     * di scrivere direttamente sull'output (es. ZipArchive::open + readfile).
     *
     * @param array<string,string> $headers
     */
    public static function stream(callable $callback, array $headers = [], int $status = 200): self
    {
        $r = new self($status);
        $r->headers = $headers;
        $r->streamCallback = Closure::fromCallable($callback);
        return $r;
    }

    public function withHeader(string $name, string $value): self
    {
        $this->headers[$name] = $value;
        return $this;
    }

    public function send(): void
    {
        if (!headers_sent()) {
            http_response_code($this->status);
            foreach ($this->headers as $name => $value) {
                header($name . ': ' . $value);
            }
        }

        if ($this->streamCallback !== null) {
            ($this->streamCallback)();
            return;
        }

        if ($this->body !== '') {
            echo $this->body;
        }
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    /**
     * @return array<string,string>
     */
    public function getHeaders(): array
    {
        return $this->headers;
    }
}
