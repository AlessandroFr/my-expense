<?php
declare(strict_types=1);

use App\Auth;
use App\Csrf;
use App\CsvService;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$userId  = (int) Auth::userId();
$create  = (bool) (int) ($_POST['create_missing_categories'] ?? 1);

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
    $result = CsvService::importFromUpload($userId, $tmpPath, $create);
} catch (Throwable $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
}

Json::ok($result);
