<?php
declare(strict_types=1);

use App\Account;
use App\Auth;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();
$includeArchived = (bool) (int) ($_GET['include_archived'] ?? 0);

try {
    $items = Account::withBalances($userId, $includeArchived);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['accounts' => $items]);
