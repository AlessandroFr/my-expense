<?php
declare(strict_types=1);

use App\Account;
use App\Auth;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}

$userId = (int) Auth::userId();
$includeArchived = (bool) (int) ($_GET['include_archived'] ?? 0);

try {
    $items = Account::withBalances($userId, $includeArchived);
} catch (Throwable $e) {
    Json::error('Errore caricamento conti: ' . $e->getMessage(), 'server', 500);
}

Json::ok(['accounts' => $items]);
