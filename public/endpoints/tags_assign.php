<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\Json;
use App\Tag;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId    = (int) Auth::userId();
$expenseId = (int) ($_POST['expense_id'] ?? 0);
$names     = $_POST['names'] ?? '';

if (is_string($names)) {
    $names = array_filter(array_map('trim', explode(',', $names)));
} elseif (!is_array($names)) {
    $names = [];
}

if ($expenseId <= 0) {
    Json::error('ID spesa mancante.', 'invalid_input', 400);
}

try {
    Tag::setForExpense($expenseId, $userId, $names);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok([
    'tags' => Tag::withColorsForExpense($expenseId, $userId),
]);
