<?php
declare(strict_types=1);

use App\Auth;
use App\Income;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();
$filters = [
    'date_from' => $_GET['date_from'] ?? null,
    'date_to'   => $_GET['date_to']   ?? null,
    'source'     => $_GET['source']     ?? null,
    'account_id' => isset($_GET['account_id']) && $_GET['account_id'] !== '' ? (int) $_GET['account_id'] : null,
    'search'     => $_GET['search']     ?? null,
    'limit'     => (int) ($_GET['limit']  ?? 200),
    'offset'    => (int) ($_GET['offset'] ?? 0),
];

try {
    $items   = Income::listForUser($userId, $filters);
    $sources = Income::distinctSources($userId);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'incomes' => $items,
    'sources' => $sources,
]);
