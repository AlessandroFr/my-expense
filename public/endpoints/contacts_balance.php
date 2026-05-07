<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();

// Range date: priorita' a from/to, fallback a year, default anno corrente.
$from = isset($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $_GET['from'])
    ? (string) $_GET['from'] : null;
$to   = isset($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $_GET['to'])
    ? (string) $_GET['to'] : null;

if ($from === null || $to === null) {
    $year = (int) ($_GET['year'] ?? date('Y'));
    if ($year < 1970 || $year > 2999) $year = (int) date('Y');
    $from = sprintf('%04d-01-01', $year);
    $to   = sprintf('%04d-12-31', $year);
}

$typeRaw = isset($_GET['type']) ? (string) $_GET['type'] : '';
$type    = ($typeRaw === 'supplier' || $typeRaw === 'customer') ? $typeRaw : null;

$contactId = isset($_GET['contact_id']) ? (int) $_GET['contact_id'] : 0;

try {
    if ($contactId > 0) {
        $contact = Contact::findForUser($contactId, $userId);
        if ($contact === null) {
            Json::error('Anagrafica non trovata.', Json::ERR_VALIDATION, 404);
        }
        $summary   = Contact::balanceSummary($userId, $from, $to, null);
        $breakdown = Contact::breakdownByCategory($userId, $contactId, $from, $to);

        // Filtra il summary alla sola anagrafica richiesta (per i KPI di dettaglio).
        $self = null;
        foreach ($summary as $row) {
            if ((int) $row['contact_id'] === $contactId) { $self = $row; break; }
        }

        Json::ok([
            'from'      => $from,
            'to'        => $to,
            'contact'   => $contact,
            'totals'    => $self,
            'breakdown' => $breakdown,
        ]);
    }

    $summary = Contact::balanceSummary($userId, $from, $to, $type);
    Json::ok([
        'from'    => $from,
        'to'      => $to,
        'type'    => $type,
        'summary' => $summary,
    ]);
} catch (Throwable $e) {
    Json::serverError($e);
}
