<?php
declare(strict_types=1);

namespace App\Controllers;

use App\BankStatementImporter;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use InvalidArgumentException;

/**
 * Import estratto conto bancario. Wizard preview + commit.
 * Delega a App\BankStatementImporter (parser Banca Sella/Patavina, MCC mapping,
 * partita doppia per ricariche/prelievi, idempotency via import_hash).
 */
final class BankImportController extends BaseController
{
    /** POST /import/bank-statement/preview */
    public function preview(Request $request): Response
    {
        $userId        = $this->userId();
        $accountId     = (int) ($request->input('account_id') ?? 0);
        $pairRicariche = (bool) (int) ($request->input('auto_pair_ricariche') ?? 1);
        $pairPrelievi  = (bool) (int) ($request->input('auto_pair_prelievi')  ?? 1);

        if ($accountId <= 0) {
            throw HttpException::badRequest('Seleziona il conto su cui importare i movimenti.');
        }
        $file = $request->file('file');
        if ($file === null || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $code = $file['error'] ?? UPLOAD_ERR_NO_FILE;
            throw HttpException::badRequest('Upload fallito (codice ' . $code . ').');
        }
        $tmpPath  = (string) $file['tmp_name'];
        $origName = (string) ($file['name'] ?? 'upload.csv');
        if (!preg_match('/\.csv$/i', $origName)) {
            throw HttpException::badRequest('Sono accettati solo file .csv.');
        }
        try {
            $result = BankStatementImporter::preview($userId, $accountId, $tmpPath, $pairRicariche, $pairPrelievi);
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        return $this->json($result);
    }

    /** POST /import/bank-statement/commit */
    public function commit(Request $request): Response
    {
        $userId    = $this->userId();
        $accountId = (int) ($request->input('account_id') ?? 0);
        $prepaid   = trim((string) ($request->input('prepaid_account_name') ?? 'Carta Prepagata'));
        if ($prepaid === '') {
            $prepaid = 'Carta Prepagata';
        }
        if ($accountId <= 0) {
            throw HttpException::badRequest('Conto sorgente mancante.');
        }
        $rowsRaw = (string) ($request->input('rows') ?? '');
        if ($rowsRaw === '') {
            throw HttpException::badRequest('Nessuna riga da importare.');
        }
        $rows = json_decode($rowsRaw, true);
        if (!is_array($rows)) {
            throw HttpException::badRequest('Formato righe non valido (JSON atteso).');
        }
        try {
            $result = BankStatementImporter::commit($userId, $accountId, $rows, $prepaid);
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        return $this->json($result);
    }
}
