<?php
declare(strict_types=1);

use App\Auth;
use App\Json;
use App\SavedFilter;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();
$scope  = (string) ($_GET['scope'] ?? 'expenses');

try {
    $items = SavedFilter::listForUser($userId, $scope);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['filters' => $items]);
