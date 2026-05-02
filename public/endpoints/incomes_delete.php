<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\Income;
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
    Json::error('ID entrata mancante.', Json::ERR_VALIDATION, 400);
}

try {
    Income::delete($id, $userId);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['deleted' => true]);
