<?php
declare(strict_types=1);

use App\Auth;
use App\Category;
use App\Json;
use App\RecurringExpense;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();

try {
    $items      = RecurringExpense::listForUser($userId);
    $categories = Category::allForUser($userId);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'items'      => $items,
    'categories' => $categories,
]);
