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
    Json::error('Sessione scaduta. Effettua di nuovo il login.', 'unauthenticated', 401);
}

if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$name      = (string) ($_POST['name'] ?? '');
$color     = (string) ($_POST['color'] ?? '#6c757d');
$iconRaw   = trim((string) ($_POST['icon'] ?? ''));
$icon      = $iconRaw === '' ? null : $iconRaw;
$sortOrder = (int) ($_POST['sort_order'] ?? 0);

try {
    $id = Category::create((int) Auth::userId(), $name, $color, $icon, $sortOrder);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), 'validation', 400);
} catch (RuntimeException $e) {
    Json::error($e->getMessage(), 'conflict', 409);
} catch (Throwable $e) {
    Json::error('Errore server: ' . $e->getMessage(), 'server', 500);
}

$row = Category::findForUser($id, (int) Auth::userId());
Json::ok(['category' => $row]);
