<?php
declare(strict_types=1);

use App\Auth;
use App\BackupRestoreService;
use App\Csrf;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$phrase   = trim((string) ($_POST['confirm_phrase'] ?? ''));
$password = (string) ($_POST['password'] ?? '');

if ($phrase !== 'RIPRISTINA BACKUP') {
    Json::error(
        'Frase di conferma errata. Digita esattamente "RIPRISTINA BACKUP".',
        Json::ERR_VALIDATION,
        400
    );
}
if ($password === '') {
    Json::error('Password obbligatoria.', Json::ERR_VALIDATION, 400);
}

if (!isset($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $code = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    Json::error('Upload fallito (codice ' . $code . ').', Json::ERR_VALIDATION, 400);
}

$tmpPath  = $_FILES['file']['tmp_name'];
$origName = (string) ($_FILES['file']['name'] ?? 'upload');

if (!is_uploaded_file($tmpPath)) {
    Json::error('File caricato non valido.', Json::ERR_VALIDATION, 400);
}
if (!preg_match('/\.(zip|sql)$/i', $origName)) {
    Json::error('Sono accettati solo file .zip o .sql.', Json::ERR_VALIDATION, 400);
}

$userId = (int) Auth::userId();
if (!Auth::verifyPassword($userId, $password)) {
    Json::error('Password errata.', Json::ERR_FORBIDDEN, 403);
}

try {
    $result = BackupRestoreService::restoreForUser($userId, $tmpPath, $origName);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        Json::error(
            'Conflitto di chiavi: il backup contiene ID già occupati nel database. '
            . 'Ripristina su un\'installazione pulita.',
            Json::ERR_CONFLICT,
            409
        );
    }
    Json::serverError($e, 'Errore durante il ripristino.');
} catch (Throwable $e) {
    Json::serverError($e, 'Errore durante il ripristino.');
}

Json::ok($result);
