<?php
declare(strict_types=1);

use App\Auth;
use App\Json;
use App\Tag;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}

$userId = (int) Auth::userId();

try {
    $items = Tag::allForUser($userId);
} catch (Throwable $e) {
    Json::error('Errore caricamento tag: ' . $e->getMessage(), 'server', 500);
}

Json::ok(['tags' => $items]);
