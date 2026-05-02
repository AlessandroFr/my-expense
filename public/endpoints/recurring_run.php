<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\Json;
use App\RecurringExpense;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$userId = (int) Auth::userId();

try {
    $created = RecurringExpense::generatePending($userId);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['created' => $created]);
