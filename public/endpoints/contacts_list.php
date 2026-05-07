<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();
$includeArchived = (bool) (int) ($_GET['include_archived'] ?? 0);
$typeRaw = isset($_GET['type']) ? (string) $_GET['type'] : '';
$type    = ($typeRaw === 'supplier' || $typeRaw === 'customer') ? $typeRaw : null;

try {
    $items = Contact::allForUser($userId, $includeArchived, $type);

    // Per ogni contatto: usage counts (per la pagina /contacts) — best effort,
    // 1 query per contatto. Ottimizzabile in futuro se la lista cresce.
    if (!empty($_GET['with_usage']) && (int) $_GET['with_usage'] === 1) {
        foreach ($items as &$c) {
            $c['usage'] = Contact::usageCount((int) $c['id'], $userId);
        }
        unset($c);
    }
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['contacts' => $items]);
