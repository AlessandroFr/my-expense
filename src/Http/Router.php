<?php
declare(strict_types=1);

namespace App\Http;

use App\Http\Middleware\MiddlewareInterface;
use Closure;
use RuntimeException;
use Throwable;

/**
 * Risolve la request a una Route, costruisce la middleware chain, invoca il
 * controller. Le route si registrano via array di tuple [method, path, handler, middleware[]]
 * caricate dai file in /routes (web.php per HTML, api.php per JSON).
 */
final class Router
{
    /** @var array<string, Route> hashmap "METHOD path" -> Route */
    private array $routes = [];

    /** @var array<string, class-string<MiddlewareInterface>> alias -> classe */
    private array $aliases = [];

    /** @var list<class-string<MiddlewareInterface>> middleware globali (eseguiti su tutte le route) */
    private array $globalMiddleware = [];

    /** @var array<string, true> path -> true se la route e' API (404 JSON invece di HTML) */
    private array $apiPaths = [];

    public function alias(string $name, string $middlewareClass): void
    {
        $this->aliases[$name] = $middlewareClass;
    }

    /**
     * @param class-string<MiddlewareInterface> $middlewareClass
     */
    public function pushGlobal(string $middlewareClass): void
    {
        $this->globalMiddleware[] = $middlewareClass;
    }

    /**
     * @param array<int, array{0:string,1:string,2:array|Closure,3?:list<string>}> $routes
     */
    public function registerWeb(array $routes): void
    {
        $this->registerAll($routes, false);
    }

    /**
     * @param array<int, array{0:string,1:string,2:array|Closure,3?:list<string>}> $routes
     */
    public function registerApi(array $routes): void
    {
        $this->registerAll($routes, true);
    }

    /**
     * @param array<int, array{0:string,1:string,2:array|Closure,3?:list<string>}> $routes
     */
    private function registerAll(array $routes, bool $isApi): void
    {
        foreach ($routes as $tuple) {
            [$method, $path, $handler] = $tuple;
            $middleware = $tuple[3] ?? [];
            $route = new Route(strtoupper($method), $path, $handler, $middleware);
            $this->routes[$route->key()] = $route;
            if ($isApi) {
                $this->apiPaths[$path] = true;
            }
        }
    }

    public function dispatch(Request $request): Response
    {
        $key = strtoupper($request->method()) . ' ' . $request->path();
        $route = $this->routes[$key] ?? null;

        $action = $route !== null
            ? $this->actionForRoute($route)
            : $this->notFoundAction();

        $middlewareStack = $route !== null
            ? array_merge($this->globalMiddleware, $this->resolveAliases($route->middleware))
            : $this->globalMiddleware;

        $pipeline = $this->buildPipeline($middlewareStack, $action);

        try {
            return $pipeline($request);
        } catch (HttpException $e) {
            return $this->renderHttpException($e, $request);
        } catch (Throwable $e) {
            error_log('[my-expense] ' . $e::class . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString());
            return $this->renderServerError($request);
        }
    }

    /**
     * @param list<string> $aliases
     * @return list<class-string<MiddlewareInterface>>
     */
    private function resolveAliases(array $aliases): array
    {
        $out = [];
        foreach ($aliases as $alias) {
            if (!isset($this->aliases[$alias])) {
                throw new RuntimeException("Middleware alias non registrato: {$alias}");
            }
            $out[] = $this->aliases[$alias];
        }
        return $out;
    }

    /**
     * @return Closure(Request): Response
     */
    private function actionForRoute(Route $route): Closure
    {
        return function (Request $request) use ($route): Response {
            $handler = $route->handler;
            if ($handler instanceof Closure) {
                $result = $handler($request);
            } else {
                [$class, $method] = $handler;
                $controller = new $class();
                $result = $controller->{$method}($request);
            }
            if (!$result instanceof Response) {
                $label = is_array($handler) ? $handler[0] . '::' . $handler[1] : 'closure';
                throw new RuntimeException("Il controller {$label} deve restituire un'istanza di Response.");
            }
            return $result;
        };
    }

    /**
     * @return Closure(Request): Response
     */
    private function notFoundAction(): Closure
    {
        return function (Request $request): Response {
            if ($this->isApiPath($request->path()) || $request->wantsJson()) {
                return Response::error('Risorsa non trovata.', Response::ERR_NOT_FOUND, 404);
            }
            $html = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
                . '<title>Pagina non trovata</title></head><body>'
                . '<h1>404 - Pagina non trovata</h1>'
                . '<p>La risorsa richiesta non esiste.</p>'
                . '</body></html>';
            return Response::html($html, 404);
        };
    }

    private function isApiPath(string $path): bool
    {
        return isset($this->apiPaths[$path]);
    }

    /**
     * @param list<class-string<MiddlewareInterface>>  $stack
     * @param Closure(Request): Response               $finalAction
     * @return Closure(Request): Response
     */
    private function buildPipeline(array $stack, Closure $finalAction): Closure
    {
        return array_reduce(
            array_reverse($stack),
            static function (Closure $next, string $middlewareClass): Closure {
                return static function (Request $request) use ($next, $middlewareClass): Response {
                    /** @var MiddlewareInterface $mw */
                    $mw = new $middlewareClass();
                    return $mw->handle($request, $next);
                };
            },
            $finalAction,
        );
    }

    private function renderHttpException(HttpException $e, Request $request): Response
    {
        if ($this->isApiPath($request->path()) || $request->wantsJson()) {
            return Response::error(
                $e->getMessage() !== '' ? $e->getMessage() : 'Errore.',
                $e->errorCode,
                $e->status,
                $e->details,
            );
        }
        $html = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
            . '<title>Errore ' . $e->status . '</title></head><body>'
            . '<h1>Errore ' . $e->status . '</h1>'
            . '<p>' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') . '</p>'
            . '</body></html>';
        return Response::html($html, $e->status);
    }

    private function renderServerError(Request $request): Response
    {
        if ($this->isApiPath($request->path()) || $request->wantsJson()) {
            return Response::error('Errore server interno.', Response::ERR_SERVER, 500);
        }
        $html = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
            . '<title>Errore 500</title></head><body>'
            . '<h1>500 - Errore server</h1>'
            . '<p>Si e\' verificato un errore interno. Riprova piu\' tardi.</p>'
            . '</body></html>';
        return Response::html($html, 500);
    }
}
