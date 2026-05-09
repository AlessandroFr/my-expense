<?php
declare(strict_types=1);

namespace App\Http\Middleware;

use App\Csrf;
use App\Http\Request;
use App\Http\Response;
use Closure;

/**
 * Verifica il token CSRF dual-source (hidden field _csrf O header X-CSRF-Token
 * sincronizzato dal cookie csrf_token via public/js/FetchRequest.js).
 *
 * Delega a App\Csrf::check() per preservare la semantica esistente.
 */
final class CsrfMiddleware implements MiddlewareInterface
{
    public function handle(Request $request, Closure $next): Response
    {
        // GET/HEAD non richiedono CSRF (idempotenti). Stesso comportamento del codice
        // attuale: Csrf::check() viene invocato solo negli endpoint POST/mutate.
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        if (!Csrf::check($request->csrfToken())) {
            return Response::error(
                'CSRF token non valido.',
                Response::ERR_CSRF,
                403,
            );
        }

        return $next($request);
    }
}
