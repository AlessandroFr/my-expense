<?php
declare(strict_types=1);

namespace App\Http;

use App\Config;
use App\Csrf;
use App\Http\Middleware\AuthMiddleware;
use App\Http\Middleware\CsrfMiddleware;
use App\Http\Middleware\JsonResponseMiddleware;
use App\Http\Middleware\SetupGateMiddleware;
use App\Session;
use App\Views\View;

/**
 * Kernel HTTP. Singolo entry point dell'applicazione.
 *
 * Bootstrap:
 *   1. Carica config (Config::load)
 *   2. Avvia sessione (Session::start)
 *   3. Sincronizza CSRF token (Csrf::token) PRIMA di emettere output
 *   4. Costruisce Request da superglobals
 *   5. Registra middleware globali + alias
 *   6. Carica routes/web.php e routes/api.php nel Router
 *   7. Dispatcha la request
 */
final class Kernel
{
    private Router $router;
    private string $basePath = '';

    public function __construct(private readonly string $projectRoot)
    {
        $this->router = new Router();
    }

    public function handle(): Response
    {
        $this->bootstrap();
        $this->configureRouter();
        $this->loadRoutes();

        $request = Request::capture($this->basePath);
        return $this->router->dispatch($request);
    }

    private function bootstrap(): void
    {
        Config::load($this->projectRoot . '/config/config.php');
        $this->basePath = rtrim((string) (Config::get('app')['base_url'] ?? ''), '/');

        Session::start();
        // Sincronizza il cookie CSRF *prima* di qualsiasi output (cfr. public/index.php:20).
        Csrf::token();

        View::setProjectRoot($this->projectRoot);
    }

    private function configureRouter(): void
    {
        $this->router->alias('auth', AuthMiddleware::class);
        $this->router->alias('csrf', CsrfMiddleware::class);
        $this->router->alias('json', JsonResponseMiddleware::class);

        // Setup gate: gira sempre, prima di tutto. Sostituisce public/index.php:32-53.
        $this->router->pushGlobal(SetupGateMiddleware::class);
    }

    private function loadRoutes(): void
    {
        $webFile = $this->projectRoot . '/routes/web.php';
        $apiFile = $this->projectRoot . '/routes/api.php';

        if (is_file($webFile)) {
            $web = require $webFile;
            if (is_array($web)) {
                $this->router->registerWeb($web);
            }
        }
        if (is_file($apiFile)) {
            $api = require $apiFile;
            if (is_array($api)) {
                $this->router->registerApi($api);
            }
        }
    }

    public function router(): Router
    {
        return $this->router;
    }
}
