<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\Json;
use App\SavedFilter;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId = (int) Auth::userId();
$id     = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    Json::error('ID filtro mancante.', 'invalid_input', 400);
}

try {
    SavedFilter::delete($id, $userId);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'server', 500);
}

Json::ok(['deleted' => true]);
