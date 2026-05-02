<?php
declare(strict_types=1);

use App\Attachment;
use App\Auth;

if (!Auth::check()) {
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Sessione scaduta.';
    exit;
}

$userId        = (int) Auth::userId();
$id            = (int) ($_GET['id'] ?? 0);
$forceDownload = (bool) (int) ($_GET['download'] ?? 0);

if ($id <= 0) {
    http_response_code(400);
    echo 'ID mancante';
    exit;
}

Attachment::streamForUser($id, $userId, $forceDownload);
