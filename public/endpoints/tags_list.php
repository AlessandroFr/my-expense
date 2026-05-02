<?php
declare(strict_types=1);

use App\Auth;
use App\Json;
use App\Tag;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();

try {
    $items = Tag::allForUser($userId);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['tags' => $items]);
