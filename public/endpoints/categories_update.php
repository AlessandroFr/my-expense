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
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$id        = (int) ($_POST['id'] ?? 0);
$name      = (string) ($_POST['name'] ?? '');
$color     = (string) ($_POST['color'] ?? '#6c757d');
$iconRaw   = trim((string) ($_POST['icon'] ?? ''));
$icon      = $iconRaw === '' ? null : $iconRaw;
$sortOrder = (int) ($_POST['sort_order'] ?? 0);
$userId    = (int) Auth::userId();

if ($id <= 0) {
    Json::error('ID categoria mancante.', 'validation', 400);
}

if (Category::findForUser($id, $userId) === null) {
    Json::error('Categoria non trovata.', 'not_found', 404);
}

try {
    Category::update($id, $userId, $name, $color, $icon, $sortOrder);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), 'validation', 400);
} catch (RuntimeException $e) {
    Json::error($e->getMessage(), 'conflict', 409);
} catch (Throwable $e) {
    Json::error('Errore server: ' . $e->getMessage(), 'server', 500);
}

$row = Category::findForUser($id, $userId);
Json::ok(['category' => $row]);
