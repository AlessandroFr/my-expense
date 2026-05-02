<?php
declare(strict_types=1);

use App\Attachment;
use App\Auth;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$userId = (int) Auth::userId();
$id     = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    Json::error('ID allegato mancante.', Json::ERR_VALIDATION, 400);
}

try {
    Attachment::delete($id, $userId);
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['deleted' => true]);
