<?php
declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\Request;
use App\Http\Response;
use Closure;

/**
 * Garantisce header JSON sulle risposte delle route API. I Controller chiamano gia'
 * Response::json() che li imposta, ma questo middleware fa da rete di sicurezza in
 * caso un controller restituisca una Response generica.
 */
final class JsonResponseMiddleware implements MiddlewareInterface
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $headers  = $response->getHeaders();
        if (!isset($headers['Content-Type'])) {
            $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        if (!isset($headers['Cache-Control'])) {
            $response->withHeader('Cache-Control', 'no-store');
        }
        return $response;
    }
}
