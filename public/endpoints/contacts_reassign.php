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

$userId          = (int) Auth::userId();
$sourceContactId = (int) ($_POST['source_contact_id'] ?? 0);
$sourceAction    = (string) ($_POST['source_action'] ?? 'leave');
$itemsRaw        = (string) ($_POST['items'] ?? '');

if ($sourceContactId <= 0) {
    Json::error('ID anagrafica sorgente mancante.', Json::ERR_VALIDATION, 400);
}

$items = json_decode($itemsRaw, true);
if (!is_array($items) || empty($items)) {
    Json::error('Nessun movimento selezionato.', Json::ERR_VALIDATION, 400);
}
if (count($items) > 5000) {
    Json::error(
        'Troppi movimenti in una sola operazione (max 5000). Procedi a piccoli blocchi.',
        Json::ERR_VALIDATION,
        400
    );
}

try {
    $result = Contact::reassignMovements($userId, $sourceContactId, $items, $sourceAction);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (RuntimeException $e) {
    Json::error($e->getMessage(), Json::ERR_CONFLICT, 409);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['result' => $result]);
