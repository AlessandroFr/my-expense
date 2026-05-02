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
$id     = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    Json::error('ID entrata mancante.', 'invalid_input', 400);
}

try {
    $accountId = ($_POST['account_id'] ?? '') === '' ? null : (int) $_POST['account_id'];
    Income::update(
        $id,
        $userId,
        (string) ($_POST['source']      ?? ''),
        $_POST['description'] === null || $_POST['description'] === '' ? null : (string) $_POST['description'],
        (string) ($_POST['amount']      ?? ''),
        (string) ($_POST['income_date'] ?? ''),
        $accountId,
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok(['updated' => true]);
