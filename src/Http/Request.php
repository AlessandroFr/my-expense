<?php
declare(strict_types=1);

namespace App\Http;

use App\Auth;

/**
 * Wrapper su superglobals + request body. Costruito dal Kernel via Request::capture().
 * Sostituisce l'accesso diretto a $_GET/$_POST/$_FILES/$_SERVER negli endpoint.
 */
final class Request
{
    /** @var array<string,mixed> */
    private array $jsonBody;

    /**
     * @param array<string,mixed> $get
     * @param array<string,mixed> $post
     * @param array<string,mixed> $files
     * @param array<string,mixed> $server
     * @param array<string,mixed> $cookies
     */
    private function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $get,
        public readonly array $post,
        public readonly array $files,
        public readonly array $server,
        public readonly array $cookies,
        private readonly string $rawBody,
    ) {
        $this->jsonBody = $this->parseJsonBody();
    }

    public static function capture(string $basePath = ''): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $rawPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
        if ($basePath !== '' && str_starts_with($rawPath, $basePath)) {
            $rawPath = substr($rawPath, strlen($basePath));
        }
        $path = '/' . trim($rawPath, '/');

        $body = '';
        if ($method !== 'GET' && $method !== 'HEAD') {
            $body = file_get_contents('php://input') ?: '';
        }

        return new self(
            $method,
            $path,
            $_GET ?? [],
            $_POST ?? [],
            $_FILES ?? [],
            $_SERVER ?? [],
            $_COOKIE ?? [],
            $body,
        );
    }

    public function method(): string
    {
        return $this->method;
    }

    public function path(): string
    {
        return $this->path;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        if (array_key_exists($key, $this->post)) {
            return $this->post[$key];
        }
        return $this->jsonBody[$key] ?? $default;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        return $this->get[$key] ?? $default;
    }

    /**
     * @return array<string,mixed>
     */
    public function all(): array
    {
        return array_merge($this->get, $this->jsonBody, $this->post);
    }

    public function file(string $key): ?array
    {
        $f = $this->files[$key] ?? null;
        return is_array($f) ? $f : null;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $v = $this->server[$key] ?? null;
        return is_string($v) ? $v : null;
    }

    public function cookie(string $name): ?string
    {
        $v = $this->cookies[$name] ?? null;
        return is_string($v) ? $v : null;
    }

    public function csrfToken(): ?string
    {
        $token = $this->post['_csrf'] ?? null;
        if (is_string($token) && $token !== '') {
            return $token;
        }
        return $this->header('X-CSRF-Token');
    }

    public function isJson(): bool
    {
        $ct = $this->header('Content-Type') ?? '';
        return str_contains(strtolower($ct), 'application/json');
    }

    /**
     * Discrimina richieste API da richieste HTML pure.
     * Utilizzato dal middleware Auth per scegliere tra redirect /login (HTML)
     * e Response::json 401 (API).
     */
    public function wantsJson(): bool
    {
        if ($this->isJson()) {
            return true;
        }
        $accept = $this->header('Accept') ?? '';
        if (str_contains($accept, 'application/json')) {
            return true;
        }
        $xrw = $this->header('X-Requested-With') ?? '';
        return strtolower($xrw) === 'fetch' || strtolower($xrw) === 'xmlhttprequest';
    }

    public function userId(): int
    {
        return (int) (Auth::userId() ?? 0);
    }

    /**
     * @return array<string,mixed>
     */
    private function parseJsonBody(): array
    {
        if ($this->rawBody === '' || !$this->isJson()) {
            return [];
        }
        $decoded = json_decode($this->rawBody, true);
        return is_array($decoded) ? $decoded : [];
    }
}
