<?php
declare(strict_types=1);

use App\Attachment;
use App\Auth;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId = (int) Auth::userId();
$id     = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    Json::error('ID allegato mancante.', 'invalid_input', 400);
}

try {
    Attachment::delete($id, $userId);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok(['deleted' => true]);
