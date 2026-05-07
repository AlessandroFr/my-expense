<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
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
    $contactRaw  = $_POST['contact_id']   ?? '';
    $contactName = trim((string) ($_POST['contact_name'] ?? ''));
    $contactId   = null;
    if ($contactRaw !== '' && $contactRaw !== '0') {
        $contactId = (int) $contactRaw;
    } elseif ($contactName !== '') {
        $contactId = Contact::findOrCreate($userId, $contactName, 'supplier');
    }

    $id = RecurringExpense::create(
        $userId,
        ($_POST['category_id'] ?? '') === '' ? null : (int) $_POST['category_id'],
        (string) ($_POST['amount']         ?? ''),
        $_POST['description'] === null || $_POST['description'] === '' ? null : (string) $_POST['description'],
        (string) ($_POST['payment_method'] ?? 'card'),
        (string) ($_POST['frequency']      ?? 'monthly'),
        (string) ($_POST['start_date']     ?? ''),
        ($_POST['end_date'] ?? '') === '' ? null : (string) $_POST['end_date'],
        $contactId,
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['id' => $id]);
