<?php
declare(strict_types=1);

use App\Auth;
use App\Budget;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$userId     = (int) Auth::userId();
$categoryId = (int) ($_POST['category_id'] ?? 0);
$ym         = trim((string) ($_POST['month'] ?? ''));

try {
    Budget::deleteForMonth($userId, $categoryId, $ym);
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['deleted' => true]);
