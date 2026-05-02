<?php
declare(strict_types=1);

use App\Auth;
use App\BackupService;

if (!Auth::check()) {
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Sessione scaduta.';
    exit;
}

$userId = (int) Auth::userId();
@set_time_limit(300);

try {
    BackupService::streamBackupForUser($userId);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Errore backup: ' . $e->getMessage();
}
