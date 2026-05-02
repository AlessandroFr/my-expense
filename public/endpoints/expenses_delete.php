<?php
declare(strict_types=1);

/**
 * POST /expenses/delete — JSON envelope.
 */

use App\Auth;
use App\Csrf;
use App\Expense;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$id = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    Json::error('ID spesa mancante.', 'validation', 400);
}

try {
    Expense::delete($id, (int) Auth::userId());
} catch (Throwable $e) {
    Json::error('Eliminazione fallita: ' . $e->getMessage(), 'server', 500);
}

Json::ok(['id' => $id]);
