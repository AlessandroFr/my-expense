<?php
declare(strict_types=1);

namespace App\Http\Middleware;

use App\Auth;
use App\Config;
use App\Http\Request;
use App\Http\Response;
use Closure;
use Throwable;

/**
 * Gate iniziale del setup wizard. Replica la logica di public/index.php:32-53.
 *
 * - DB non inizializzato (Throwable da Auth::userCount())     -> pagina HTML inline "DB non inizializzato"
 * - DB vuoto (userCount === 0) e path != /setup               -> redirect /setup
 * - DB con utenti e path === /setup                           -> redirect /login
 * - altrimenti                                                -> next()
 */
final class SetupGateMiddleware implements MiddlewareInterface
{
    public function handle(Request $request, Closure $next): Response
    {
        $base  = rtrim((string) (Config::get('app')['base_url'] ?? ''), '/');
        $debug = (bool) (Config::get('app')['debug'] ?? false);

        try {
            $needsSetup = Auth::userCount() === 0;
        } catch (Throwable $e) {
            return $this->renderDbNotInitialized($e, $debug);
        }

        $path = $request->path();

        if ($needsSetup && $path !== '/setup') {
            return Response::redirect($base . '/setup');
        }
        if (!$needsSetup && $path === '/setup') {
            return Response::redirect($base . '/login');
        }

        return $next($request);
    }

    private function renderDbNotInitialized(Throwable $e, bool $debug): Response
    {
        $detail = $debug
            ? '<hr><pre>' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') . '</pre>'
            : '';
        $html = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
            . '<title>DB non inizializzato</title></head><body>'
            . '<h1>Database non inizializzato</h1>'
            . '<p>Importa <code>database/schema.sql</code> in MySQL prima di usare l\'app.</p>'
            . '<pre>mysql -u root my_expense &lt; database/schema.sql</pre>'
            . $detail
            . '</body></html>';
        return Response::html($html, 500);
    }
}
