<?php
declare(strict_types=1);

use App\Auth;
use App\Budget;
use App\Category;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}

$ym = (string) ($_GET['month'] ?? date('Y-m'));
$userId = (int) Auth::userId();

try {
    $progress   = Budget::progressForMonth($userId, $ym);
    $categories = Category::allForUser($userId);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok([
    'month'      => $ym,
    'budgets'    => $progress,
    'categories' => $categories,
]);
