<?php
declare(strict_types=1);

/**
 * POST /categories/update — JSON envelope.
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

$id        = (int) ($_POST['id'] ?? 0);
$name      = (string) ($_POST['name'] ?? '');
$color     = (string) ($_POST['color'] ?? '#6c757d');
$iconRaw   = trim((string) ($_POST['icon'] ?? ''));
$icon      = $iconRaw === '' ? null : $iconRaw;
$sortOrder = (int) ($_POST['sort_order'] ?? 0);
$userId    = (int) Auth::userId();

if ($id <= 0) {
    Json::error('ID categoria mancante.', Json::ERR_VALIDATION, 400);
}

if (Category::findForUser($id, $userId) === null) {
    Json::error('Categoria non trovata.', Json::ERR_NOT_FOUND, 404);
}

try {
    Category::update($id, $userId, $name, $color, $icon, $sortOrder);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (RuntimeException $e) {
    Json::error($e->getMessage(), Json::ERR_CONFLICT, 409);
} catch (Throwable $e) {
    Json::serverError($e);
}

$row = Category::findForUser($id, $userId);
Json::ok(['category' => $row]);
