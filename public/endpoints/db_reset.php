<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\DatabaseReset;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$scope    = (string) ($_POST['scope']          ?? '');
$phrase   = trim((string) ($_POST['confirm_phrase'] ?? ''));
$password = (string) ($_POST['password']       ?? '');

if (!in_array($scope, DatabaseReset::ALLOWED_SCOPES, true)) {
    Json::error('Ambito di reset non valido.', Json::ERR_VALIDATION, 400);
}
if ($phrase !== 'ELIMINA TUTTO') {
    Json::error('Frase di conferma errata. Digita esattamente "ELIMINA TUTTO".', Json::ERR_VALIDATION, 400);
}
if ($password === '') {
    Json::error('Password obbligatoria.', Json::ERR_VALIDATION, 400);
}

$userId = (int) Auth::userId();
if (!Auth::verifyPassword($userId, $password)) {
    Json::error('Password errata.', Json::ERR_FORBIDDEN, 403);
}

try {
    $counters = DatabaseReset::execute($userId, $scope);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'scope'    => $scope,
    'counters' => $counters,
]);
