<?php
declare(strict_types=1);

namespace App\Http\Middleware;

use App\Auth;
use App\Config;
use App\Http\Request;
use App\Http\Response;
use Closure;

/**
 * Garantisce che l'utente sia autenticato.
 * - HTML page (wantsJson() === false) -> redirect 302 a /login
 * - API (wantsJson() === true)        -> Response::json 401 con codice envelope 'unauthenticated'
 */
final class AuthMiddleware implements MiddlewareInterface
{
    public function handle(Request $request, Closure $next): Response
    {
        if (Auth::check()) {
            return $next($request);
        }

        if ($request->wantsJson()) {
            return Response::error(
                'Autenticazione richiesta.',
                Response::ERR_UNAUTH,
                401,
            );
        }

        $base = rtrim((string) (Config::get('app')['base_url'] ?? ''), '/');
        return Response::redirect($base . '/login');
    }
}
