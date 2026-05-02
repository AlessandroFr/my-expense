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

$userId  = (int) Auth::userId();
$name    = (string) ($_POST['name']  ?? '');
$scope   = (string) ($_POST['scope'] ?? 'expenses');
$payload = $_POST['payload'] ?? null;

if (is_string($payload)) {
    $decoded = json_decode($payload, true);
    $payload = is_array($decoded) ? $decoded : [];
} elseif (!is_array($payload)) {
    $payload = [];
}

try {
    $id = SavedFilter::save($userId, $scope, $name, $payload);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok(['id' => $id]);
