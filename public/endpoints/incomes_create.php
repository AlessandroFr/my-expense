<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\Income;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId = (int) Auth::userId();

try {
    $id = Income::create(
        $userId,
        (string) ($_POST['source']      ?? ''),
        $_POST['description'] === null || $_POST['description'] === '' ? null : (string) $_POST['description'],
        (string) ($_POST['amount']      ?? ''),
        (string) ($_POST['income_date'] ?? ''),
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok(['id' => $id]);
