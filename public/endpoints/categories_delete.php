<?php
declare(strict_types=1);

/**
 * POST /categories/delete — JSON envelope.
 */

use App\Auth;
use App\Category;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$id = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    Json::error('ID categoria mancante.', Json::ERR_VALIDATION, 400);
}

try {
    Category::delete($id, (int) Auth::userId());
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['id' => $id]);
