<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use RuntimeException;

final class Attachment
{
    public const MAX_BYTES = 8 * 1024 * 1024;
    public const ALLOWED_MIME = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/gif'  => 'gif',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf',
    ];

    public static function uploadsRoot(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'expenses';
    }

    /** @return array<int, array<string,mixed>> */
    public static function listForExpense(int $expenseId, int $userId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, expense_id, original_name, mime_type, size_bytes, created_at
             FROM expense_attachments
             WHERE expense_id = ? AND user_id = ?
             ORDER BY created_at DESC, id DESC'
        );
        $stmt->execute([$expenseId, $userId]);
        return $stmt->fetchAll();
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, expense_id, user_id, original_name, stored_name, mime_type, size_bytes
             FROM expense_attachments WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Salva file uploaded ($_FILES['file']) come allegato di una spesa.
     *
     * @return array{id:int, expense_id:int, original_name:string, mime_type:string, size_bytes:int}
     */
    public static function uploadForExpense(int $userId, int $expenseId, array $upload): array
    {
        $check = Database::pdo()->prepare('SELECT 1 FROM expenses WHERE id = ? AND user_id = ?');
        $check->execute([$expenseId, $userId]);
        if ($check->fetchColumn() === false) {
            throw new InvalidArgumentException('Spesa non trovata.');
        }

        if (!isset($upload['error']) || $upload['error'] !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException('Upload fallito (codice ' . ($upload['error'] ?? '?') . ').');
        }
        $tmpPath = (string) ($upload['tmp_name'] ?? '');
        if (!is_uploaded_file($tmpPath)) {
            throw new InvalidArgumentException('File non valido.');
        }
        $size = (int) ($upload['size'] ?? 0);
        if ($size <= 0 || $size > self::MAX_BYTES) {
            throw new InvalidArgumentException(
                'Dimensione file non valida (max ' . round(self::MAX_BYTES / 1024 / 1024) . ' MB).'
            );
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime  = $finfo->file($tmpPath) ?: 'application/octet-stream';
        if (!isset(self::ALLOWED_MIME[$mime])) {
            throw new InvalidArgumentException('Tipo file non ammesso (jpg/png/gif/webp/pdf).');
        }
        $ext  = self::ALLOWED_MIME[$mime];
        $orig = basename((string) ($upload['name'] ?? 'file'));
        if (mb_strlen($orig) > 255) {
            $orig = mb_substr($orig, 0, 255);
        }

        $userDir = self::uploadsRoot() . DIRECTORY_SEPARATOR . $userId;
        if (!is_dir($userDir) && !mkdir($userDir, 0755, true) && !is_dir($userDir)) {
            throw new RuntimeException('Impossibile creare la cartella uploads.');
        }
        $stored = bin2hex(random_bytes(16)) . '.' . $ext;
        $dest   = $userDir . DIRECTORY_SEPARATOR . $stored;
        if (!move_uploaded_file($tmpPath, $dest)) {
            throw new RuntimeException('Impossibile salvare il file.');
        }

        $stmt = Database::pdo()->prepare(
            'INSERT INTO expense_attachments
                (expense_id, user_id, original_name, stored_name, mime_type, size_bytes)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$expenseId, $userId, $orig, $stored, $mime, $size]);
        $id = (int) Database::pdo()->lastInsertId();

        return [
            'id'            => $id,
            'expense_id'    => $expenseId,
            'original_name' => $orig,
            'mime_type'     => $mime,
            'size_bytes'    => $size,
        ];
    }

    public static function delete(int $id, int $userId): void
    {
        $row = self::findForUser($id, $userId);
        if ($row === null) {
            throw new InvalidArgumentException('Allegato non trovato.');
        }
        $path = self::uploadsRoot() . DIRECTORY_SEPARATOR . $userId . DIRECTORY_SEPARATOR . $row['stored_name'];
        if (is_file($path)) {
            @unlink($path);
        }
        $stmt = Database::pdo()->prepare(
            'DELETE FROM expense_attachments WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    /**
     * Stream del file al client. Auth/ownership gia' verificati dal chiamante.
     */
    public static function streamForUser(int $id, int $userId, bool $forceDownload = false): void
    {
        $row = self::findForUser($id, $userId);
        if ($row === null) {
            http_response_code(404);
            echo 'Not found';
            return;
        }
        $path = self::uploadsRoot() . DIRECTORY_SEPARATOR . $userId . DIRECTORY_SEPARATOR . $row['stored_name'];
        if (!is_file($path)) {
            http_response_code(404);
            echo 'File missing';
            return;
        }
        $disposition = $forceDownload ? 'attachment' : 'inline';
        header('Content-Type: ' . $row['mime_type']);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: ' . $disposition . '; filename="' . $row['original_name'] . '"');
        header('Cache-Control: private, max-age=3600');
        readfile($path);
    }
}
