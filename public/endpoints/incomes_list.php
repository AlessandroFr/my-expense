<?php
declare(strict_types=1);

use App\Auth;
use App\Income;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}

$userId = (int) Auth::userId();
$filters = [
    'date_from' => $_GET['date_from'] ?? null,
    'date_to'   => $_GET['date_to']   ?? null,
    'source'    => $_GET['source']    ?? null,
    'search'    => $_GET['search']    ?? null,
    'limit'     => (int) ($_GET['limit']  ?? 200),
    'offset'    => (int) ($_GET['offset'] ?? 0),
];

try {
    $items   = Income::listForUser($userId, $filters);
    $sources = Income::distinctSources($userId);
} catch (Throwable $e) {
    Json::error('Errore caricamento entrate: ' . $e->getMessage(), 'server', 500);
}

Json::ok([
    'incomes' => $items,
    'sources' => $sources,
]);
