<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Attachment;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use Throwable;

/**
 * Allegati spese. Delega ad App\Attachment per upload/storage/streaming.
 */
final class AttachmentController extends BaseController
{
    /** GET /attachments/list?expense_id=N */
    public function list(Request $request): Response
    {
        $userId    = $this->userId();
        $expenseId = (int) ($request->query('expense_id') ?? 0);
        if ($expenseId <= 0) {
            throw HttpException::badRequest('ID spesa mancante.');
        }
        $items = Attachment::listForExpense($expenseId, $userId);
        return $this->json(['attachments' => $items]);
    }

    /** POST /attachments/upload */
    public function upload(Request $request): Response
    {
        $userId    = $this->userId();
        $expenseId = (int) ($request->input('expense_id') ?? 0);
        if ($expenseId <= 0) {
            throw HttpException::badRequest('ID spesa mancante.');
        }
        $file = $request->file('file');
        if ($file === null) {
            throw HttpException::badRequest('Nessun file caricato.');
        }
        try {
            $att = Attachment::uploadForExpense($userId, $expenseId, $file);
        } catch (Throwable $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        return $this->json(['attachment' => $att]);
    }

    /** POST /attachments/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID allegato mancante.');
        }
        try {
            Attachment::delete($id, $userId);
        } catch (Throwable $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        return $this->json(['deleted' => true]);
    }

    /**
     * GET /attachments/download?id=N&download=0|1 -- streaming binario.
     * NON include header CSRF perche' lanciato da link <a href> tradizionali.
     */
    public function download(Request $request): Response
    {
        $userId        = $this->userId();
        $id            = (int) ($request->query('id') ?? 0);
        $forceDownload = (bool) (int) ($request->query('download') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID mancante.');
        }
        return Response::stream(static function () use ($id, $userId, $forceDownload): void {
            Attachment::streamForUser($id, $userId, $forceDownload);
        }, []);
    }
}
