<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$userId   = (int) Auth::userId();
$id       = (int) ($_POST['id'] ?? 0);
$archived = (bool) (int) ($_POST['archived'] ?? 1);

if ($id <= 0) {
    Json::error('ID anagrafica mancante.', Json::ERR_VALIDATION, 400);
}

try {
    Contact::archive($id, $userId, $archived);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['archived' => $archived]);
