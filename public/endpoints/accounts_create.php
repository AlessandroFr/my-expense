<?php
declare(strict_types=1);

use App\Account;
use App\Auth;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId = (int) Auth::userId();

try {
    $id = Account::create(
        $userId,
        (string) ($_POST['name']            ?? ''),
        (string) ($_POST['type']            ?? 'checking'),
        (string) ($_POST['color']           ?? '#6c757d'),
        ($_POST['icon'] ?? '') === '' ? null : (string) $_POST['icon'],
        (string) ($_POST['opening_balance'] ?? '0'),
        (int)    ($_POST['sort_order']      ?? 0),
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok(['id' => $id]);
