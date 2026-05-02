<?php
declare(strict_types=1);

use App\Attachment;
use App\Auth;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}

$userId    = (int) Auth::userId();
$expenseId = (int) ($_GET['expense_id'] ?? 0);
if ($expenseId <= 0) {
    Json::error('ID spesa mancante.', 'invalid_input', 400);
}

try {
    $items = Attachment::listForExpense($expenseId, $userId);
} catch (Throwable $e) {
    Json::error('Errore caricamento allegati: ' . $e->getMessage(), 'server', 500);
}

Json::ok(['attachments' => $items]);
