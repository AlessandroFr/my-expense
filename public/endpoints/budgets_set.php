<?php
declare(strict_types=1);

use App\Auth;
use App\Budget;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId     = (int) Auth::userId();
$categoryId = (int) ($_POST['category_id'] ?? 0);
$ym         = trim((string) ($_POST['month'] ?? ''));
$amount     = (string) ($_POST['amount'] ?? '');

try {
    Budget::setForMonth($userId, $categoryId, $ym, $amount);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok(['saved' => true]);
