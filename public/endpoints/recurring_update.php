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
if ($id <= 0) {
    Json::error('ID ricorrente mancante.', 'invalid_input', 400);
}

try {
    RecurringExpense::update(
        $id,
        $userId,
        ($_POST['category_id'] ?? '') === '' ? null : (int) $_POST['category_id'],
        (string) ($_POST['amount']         ?? ''),
        $_POST['description'] === null || $_POST['description'] === '' ? null : (string) $_POST['description'],
        (string) ($_POST['payment_method'] ?? 'card'),
        (string) ($_POST['frequency']      ?? 'monthly'),
        (string) ($_POST['start_date']     ?? ''),
        ($_POST['end_date'] ?? '') === '' ? null : (string) $_POST['end_date'],
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok(['updated' => true]);
