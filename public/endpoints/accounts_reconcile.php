<?php
declare(strict_types=1);

use App\AccountReconciliation;
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
$accountId = (int) ($_POST['account_id'] ?? 0);
if ($accountId <= 0) {
    Json::error('ID conto mancante.', Json::ERR_VALIDATION, 400);
}

$declared     = (string) ($_POST['declared_balance'] ?? '');
$reconciledAt = (string) ($_POST['reconciled_at']    ?? date('Y-m-d'));
$notesRaw     = $_POST['notes'] ?? null;
$notes        = $notesRaw === null ? null : (string) $notesRaw;

try {
    $row = AccountReconciliation::reconcile(
        $userId, $accountId, $declared, $reconciledAt, $notes
    );
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'reconciliation' => $row,
    'new_balance'    => $row['declared_balance'],
]);
