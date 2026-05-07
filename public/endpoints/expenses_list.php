<?php
declare(strict_types=1);

/**
 * GET /expenses/list — JSON envelope con array di spese filtrate.
 */

use App\Auth;
use App\Expense;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$filters = [
    'date_from'   => $_GET['date_from']   ?? null,
    'date_to'     => $_GET['date_to']     ?? null,
    'category_id' => isset($_GET['category_id']) && $_GET['category_id'] !== '' ? (int) $_GET['category_id'] : null,
    'account_id'  => isset($_GET['account_id'])  && $_GET['account_id']  !== '' ? (int) $_GET['account_id']  : null,
    'contact_id'  => isset($_GET['contact_id'])  && $_GET['contact_id']  !== '' ? (int) $_GET['contact_id']  : null,
    'amount_min'  => $_GET['amount_min']  ?? null,
    'amount_max'  => $_GET['amount_max']  ?? null,
    'search'      => $_GET['search']      ?? null,
    'tag'         => $_GET['tag']          ?? null,
    'limit'       => isset($_GET['limit'])  ? (int) $_GET['limit']  : 200,
    'offset'      => isset($_GET['offset']) ? (int) $_GET['offset'] : 0,
];

try {
    $userId = (int) Auth::userId();
    $rows   = Expense::listForUser($userId, $filters);
    $total  = Expense::countForUser($userId, $filters);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'expenses' => $rows,
    'total'    => $total,
    'limit'    => (int) $filters['limit'],
    'offset'   => (int) $filters['offset'],
]);
