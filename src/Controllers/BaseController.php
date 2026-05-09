<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Config;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Validation\Requests\ValidatedRequest;

/**
 * Classe base per i Controller. Espone helper concisi per costruire Response
 * e per validare l'input via ValidatedRequest.
 *
 * I Controller restituiscono SEMPRE un'istanza di Response - il Router rifiuta
 * altri valori di ritorno con RuntimeException (vedi Router::actionForRoute).
 */
abstract class BaseController
{
    /**
     * @param array<string, mixed> $data
     */
    protected function json(array $data, int $status = 200): Response
    {
        return Response::json($data, $status);
    }

    /**
     * @param array<string, mixed>|null $details
     */
    protected function error(string $message, string $code = Response::ERR_VALIDATION, int $status = 400, ?array $details = null): Response
    {
        return Response::error($message, $code, $status, $details);
    }

    /**
     * Render di un template. Usa il View renderer introdotto in C5.
     *
     * @param array<string, mixed> $data
     */
    protected function view(string $template, array $data = [], int $status = 200): Response
    {
        if (class_exists(\App\Views\View::class)) {
            $html = \App\Views\View::render($template, $data);
            return Response::html($html, $status);
        }
        // Fallback (durante C2-C4 la view layer non e' ancora pronta).
        return Response::html("<!-- view {$template} not yet rendered -->", $status);
    }

    protected function redirect(string $path, int $status = 302): Response
    {
        $base = rtrim((string) (Config::get('app')['base_url'] ?? ''), '/');
        $url  = str_starts_with($path, 'http') ? $path : $base . $path;
        return Response::redirect($url, $status);
    }

    /**
     * Valida l'input del Request usando una sottoclasse di ValidatedRequest.
     * Lancia HttpException 422 (catturata dal Router) se la validazione fallisce.
     *
     * @param class-string<ValidatedRequest> $requestClass
     * @return array<string, mixed>
     */
    protected function validated(string $requestClass, Request $request): array
    {
        return $requestClass::from($request);
    }

    /**
     * @throws HttpException 401 se l'utente non e' loggato. Usato come "guard"
     *         interno quando il Controller serve sia route pubbliche che protette.
     */
    protected function userId(): int
    {
        $id = Auth::userId();
        if ($id === null) {
            throw HttpException::unauthorized();
        }
        return (int) $id;
    }
}
