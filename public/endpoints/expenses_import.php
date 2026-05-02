<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\CsvService;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$userId  = (int) Auth::userId();
$create  = (bool) (int) ($_POST['create_missing_categories'] ?? 1);

if (!isset($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $code = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    Json::error('Upload fallito (codice ' . $code . ').', 'invalid_input', 400);
}

$tmpPath  = $_FILES['file']['tmp_name'];
$origName = $_FILES['file']['name'] ?? 'upload.csv';
if (!preg_match('/\.csv$/i', $origName)) {
    Json::error('Sono accettati solo file .csv.', 'invalid_input', 400);
}

try {
    $result = CsvService::importFromUpload($userId, $tmpPath, $create);
} catch (Throwable $e) {
    Json::error($e->getMessage(), 'invalid_input', 400);
}

Json::ok($result);
