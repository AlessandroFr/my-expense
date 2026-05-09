<?php
declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\Request;
use App\Http\Response;
use Closure;

/**
 * Tutti i middleware implementano questa interfaccia. Il Router costruisce la
 * chain via array_reduce e passa $next come closure che invoca il prossimo
 * middleware (o l'action del controller se siamo in fondo).
 */
interface MiddlewareInterface
{
    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response;
}
