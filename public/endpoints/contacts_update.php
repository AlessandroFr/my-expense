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
$id     = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    Json::error('ID anagrafica mancante.', Json::ERR_VALIDATION, 400);
}

try {
    Contact::update(
        $id,
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
        (bool) (int) ($_POST['archived'] ?? 0),
    );
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['updated' => true]);
