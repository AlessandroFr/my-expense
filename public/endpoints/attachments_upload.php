<?php
declare(strict_types=1);

use App\Attachment;
use App\Auth;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$userId    = (int) Auth::userId();
$expenseId = (int) ($_POST['expense_id'] ?? 0);
if ($expenseId <= 0) {
    Json::error('ID spesa mancante.', Json::ERR_VALIDATION, 400);
}
if (!isset($_FILES['file'])) {
    Json::error('Nessun file caricato.', Json::ERR_VALIDATION, 400);
}

try {
    $att = Attachment::uploadForExpense($userId, $expenseId, $_FILES['file']);
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok(['attachment' => $att]);
