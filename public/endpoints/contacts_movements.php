<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId    = (int) Auth::userId();
$contactId = (int) ($_GET['contact_id'] ?? 0);

if ($contactId <= 0) {
    Json::error('ID anagrafica mancante.', Json::ERR_VALIDATION, 400);
}

$contact = Contact::findForUser($contactId, $userId);
if ($contact === null) {
    Json::error('Anagrafica non trovata.', Json::ERR_NOT_FOUND, 404);
}

$page     = max(1, (int) ($_GET['page'] ?? 1));
$pageSize = (int) ($_GET['page_size'] ?? 50);
if ($pageSize < 1)   $pageSize = 50;
if ($pageSize > 200) $pageSize = 200;

try {
    $rows = Contact::movementsForUser($userId, $contactId, [
        'limit'  => $pageSize,
        'offset' => ($page - 1) * $pageSize,
    ]);
    $usage = Contact::usageCount($contactId, $userId);
    $counts = [
        'expense'   => $usage['expenses'],
        'income'    => $usage['incomes'],
        'recurring' => $usage['recurring'],
        'total'     => $usage['total'],
    ];
    $totalPages = (int) max(1, (int) ceil($counts['total'] / $pageSize));
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'movements'   => $rows,
    'counts'      => $counts,
    'page'        => $page,
    'page_size'   => $pageSize,
    'total_pages' => $totalPages,
]);
