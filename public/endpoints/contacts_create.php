<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
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
    $id = Contact::create(
        $userId,
        (string) ($_POST['name'] ?? ''),
        (string) ($_POST['type'] ?? 'both'),
        [
            'vat_number' => (string) ($_POST['vat_number'] ?? ''),
            'iban'       => (string) ($_POST['iban']       ?? ''),
            'email'      => (string) ($_POST['email']      ?? ''),
            'notes'      => (string) ($_POST['notes']      ?? ''),
            'color'      => (string) ($_POST['color']      ?? '#6c757d'),
        ],
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['id' => $id]);
