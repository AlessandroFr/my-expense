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
$pair      = (bool) (int) ($_POST['auto_pair_ricariche'] ?? 1);

if ($accountId <= 0) {
    Json::error('Seleziona il conto su cui importare i movimenti.', Json::ERR_VALIDATION, 400);
}

if (!isset($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $code = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    Json::error('Upload fallito (codice ' . $code . ').', Json::ERR_VALIDATION, 400);
}

$tmpPath  = $_FILES['file']['tmp_name'];
$origName = $_FILES['file']['name'] ?? 'upload.csv';
if (!preg_match('/\.csv$/i', $origName)) {
    Json::error('Sono accettati solo file .csv.', Json::ERR_VALIDATION, 400);
}

try {
    $result = BankStatementImporter::preview($userId, $accountId, $tmpPath, $pair);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (Throwable $e) {
    Json::serverError($e, 'Errore durante l\'anteprima.');
}

Json::ok($result);
