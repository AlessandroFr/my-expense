<?php
declare(strict_types=1);

use App\Attachment;
use App\Auth;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId    = (int) Auth::userId();
$expenseId = (int) ($_GET['expense_id'] ?? 0);
if ($expenseId <= 0) {
    Json::error('ID spesa mancante.', Json::ERR_VALIDATION, 400);
}

try {
    $items = Attachment::listForExpense($expenseId, $userId);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok(['attachments' => $items]);
