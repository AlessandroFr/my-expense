<?php
declare(strict_types=1);

use App\Auth;
use App\CsvService;
use App\Expense;
use App\Json;

if (!Auth::check()) {
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Sessione scaduta.';
    exit;
}

$userId  = (int) Auth::userId();
$filters = [
    'date_from'   => $_GET['date_from']   ?? null,
    'date_to'     => $_GET['date_to']     ?? null,
    'category_id' => $_GET['category_id'] ?? null,
    'amount_min'  => $_GET['amount_min']  ?? null,
    'amount_max'  => $_GET['amount_max']  ?? null,
    'search'      => $_GET['search']      ?? null,
    'limit'       => 5000,
    'offset'      => 0,
];

try {
    $rows = Expense::listForUser($userId, $filters);
    CsvService::exportToStdout($rows, 'expenses');
} catch (Throwable $e) {
    Json::serverError($e);
}
