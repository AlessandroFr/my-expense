<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\BackupRestoreService;
use App\BackupService;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use InvalidArgumentException;
use PDOException;

/**
 * Backup ZIP (download) + restore.
 */
final class BackupController extends BaseController
{
    /** GET /backup/download -- streaming ZIP. */
    public function download(Request $request): Response
    {
        $userId = $this->userId();
        @set_time_limit(300);
        return Response::stream(static function () use ($userId): void {
            BackupService::streamBackupForUser($userId);
        }, []);
    }

    /** POST /backup/restore */
    public function restore(Request $request): Response
    {
        $userId   = $this->userId();
        $phrase   = trim((string) ($request->input('confirm_phrase') ?? ''));
        $password = (string) ($request->input('password') ?? '');

        if ($phrase !== 'RIPRISTINA BACKUP') {
            throw HttpException::badRequest('Frase di conferma errata. Digita esattamente "RIPRISTINA BACKUP".');
        }
        if ($password === '') {
            throw HttpException::badRequest('Password obbligatoria.');
        }

        $file = $request->file('file');
        if ($file === null || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $code = $file['error'] ?? UPLOAD_ERR_NO_FILE;
            throw HttpException::badRequest('Upload fallito (codice ' . $code . ').');
        }
        $tmpPath  = (string) $file['tmp_name'];
        $origName = (string) ($file['name'] ?? 'upload');
        if (!is_uploaded_file($tmpPath)) {
            throw HttpException::badRequest('File caricato non valido.');
        }
        if (!preg_match('/\.(zip|sql)$/i', $origName)) {
            throw HttpException::badRequest('Sono accettati solo file .zip o .sql.');
        }

        if (!Auth::verifyPassword($userId, $password)) {
            throw HttpException::forbidden('Password errata.');
        }

        try {
            $result = BackupRestoreService::restoreForUser($userId, $tmpPath, $origName);
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw HttpException::conflict(
                    "Conflitto di chiavi: il backup contiene ID gia' occupati nel database. Ripristina su un'installazione pulita."
                );
            }
            throw $e;
        }
        return $this->json($result);
    }
}
