<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\Json;
use App\RecurringExpense;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId = (int) Auth::userId();

try {
    $created = RecurringExpense::generatePending($userId);
} catch (Throwable $e) {
    Json::error('Errore generazione: ' . $e->getMessage(), 'server', 500);
}

Json::ok(['created' => $created]);
