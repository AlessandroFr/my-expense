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
$id     = (int) ($_POST['id'] ?? 0);
$active = (bool) (int) ($_POST['active'] ?? 0);
if ($id <= 0) {
    Json::error('ID ricorrente mancante.', 'invalid_input', 400);
}

try {
    RecurringExpense::setActive($id, $userId, $active);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'server', 500);
}

Json::ok(['active' => $active]);
