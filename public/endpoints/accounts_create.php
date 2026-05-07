<?php
declare(strict_types=1);

use App\Account;
use App\Auth;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
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
        [
            'iban'           => (string) ($_POST['iban']           ?? ''),
            'bic'            => (string) ($_POST['bic']            ?? ''),
            'bank_name'      => (string) ($_POST['bank_name']      ?? ''),
            'account_holder' => (string) ($_POST['account_holder'] ?? ''),
            'account_number' => (string) ($_POST['account_number'] ?? ''),
            'notes'          => (string) ($_POST['notes']          ?? ''),
        ],
        !empty($_POST['is_default_cash']),
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['id' => $id]);
