<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
use App\Csrf;
use App\Income;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$userId = (int) Auth::userId();

try {
    $accountId = ($_POST['account_id'] ?? '') === '' ? null : (int) $_POST['account_id'];

    $contactRaw  = $_POST['contact_id']   ?? '';
    $contactName = trim((string) ($_POST['contact_name'] ?? ''));
    $contactId   = null;
    if ($contactRaw !== '' && $contactRaw !== '0') {
        $contactId = (int) $contactRaw;
    } elseif ($contactName !== '') {
        $contactId = Contact::findOrCreate($userId, $contactName, 'customer');
    }

    $id = Income::create(
        $userId,
        (string) ($_POST['source']      ?? ''),
        $_POST['description'] === null || $_POST['description'] === '' ? null : (string) $_POST['description'],
        (string) ($_POST['amount']      ?? ''),
        (string) ($_POST['income_date'] ?? ''),
        $accountId,
        $contactId,
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['id' => $id]);
