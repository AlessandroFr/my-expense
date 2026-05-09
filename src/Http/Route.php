<?php
declare(strict_types=1);

namespace App\Http;

use Closure;

/**
 * Value object immutabile che descrive una rotta registrata nel Router.
 * `handler` puo' essere [Controller::class, 'action'] oppure una closure.
 */
final class Route
{
    /**
     * @param array{0: class-string, 1: string}|Closure $handler
     * @param list<string>                              $middleware alias dei middleware (es. 'auth', 'csrf')
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array|Closure $handler,
        public readonly array $middleware = [],
    ) {
    }

    public function key(): string
    {
        return strtoupper($this->method) . ' ' . $this->path;
    }
}
