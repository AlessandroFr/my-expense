<?php
declare(strict_types=1);

use App\Auth;
use App\BankStatementImporter;
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
$prepaid   = trim((string) ($_POST['prepaid_account_name'] ?? 'Carta Prepagata'));
if ($prepaid === '') $prepaid = 'Carta Prepagata';

if ($accountId <= 0) {
    Json::error('Conto sorgente mancante.', Json::ERR_VALIDATION, 400);
}

$rowsRaw = (string) ($_POST['rows'] ?? '');
if ($rowsRaw === '') {
    Json::error('Nessuna riga da importare.', Json::ERR_VALIDATION, 400);
}

$rows = json_decode($rowsRaw, true);
if (!is_array($rows)) {
    Json::error('Formato righe non valido (JSON atteso).', Json::ERR_VALIDATION, 400);
}

try {
    $result = BankStatementImporter::commit($userId, $accountId, $rows, $prepaid);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (Throwable $e) {
    Json::serverError($e, 'Errore durante la conferma import.');
}

Json::ok($result);
