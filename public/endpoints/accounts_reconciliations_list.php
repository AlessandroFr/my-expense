<?php
declare(strict_types=1);

use App\Account;
use App\AccountReconciliation;
use App\Auth;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId    = (int) Auth::userId();
$accountId = (int) ($_GET['account_id'] ?? 0);
if ($accountId <= 0) {
    Json::error('ID conto mancante.', Json::ERR_VALIDATION, 400);
}

if (Account::findForUser($accountId, $userId) === null) {
    Json::error('Conto non trovato.', Json::ERR_NOT_FOUND, 404);
}

try {
    $items = AccountReconciliation::listForAccount($userId, $accountId);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['reconciliations' => $items]);
