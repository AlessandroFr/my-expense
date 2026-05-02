<?php
declare(strict_types=1);

/**
 * POST /categories/create — JSON envelope.
 */

use App\Auth;
use App\Category;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta. Effettua di nuovo il login.', Json::ERR_UNAUTH, 401);
}

if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$name      = (string) ($_POST['name'] ?? '');
$color     = (string) ($_POST['color'] ?? '#6c757d');
$iconRaw   = trim((string) ($_POST['icon'] ?? ''));
$icon      = $iconRaw === '' ? null : $iconRaw;
$sortOrder = (int) ($_POST['sort_order'] ?? 0);

try {
    $id = Category::create((int) Auth::userId(), $name, $color, $icon, $sortOrder);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (RuntimeException $e) {
    Json::error($e->getMessage(), Json::ERR_CONFLICT, 409);
} catch (Throwable $e) {
    Json::serverError($e);
}

$row = Category::findForUser($id, (int) Auth::userId());
Json::ok(['category' => $row]);
