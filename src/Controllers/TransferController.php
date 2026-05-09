<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Services\TransferService;

/**
 * Controller per i trasferimenti atomici fra conti.
 *
 * Endpoint:
 *   GET  /transfers           -> view transfers.index
 *   GET  /transfers/list      -> JSON list (filtri: date_from, date_to, account_id)
 *   POST /transfers/create    -> JSON envelope con la nuova entity
 *   POST /transfers/delete    -> rimuove il transfer (cascade su expense+income)
 */
final class TransferController extends BaseController
{
    public function __construct(
        private readonly TransferService $service = new TransferService(),
    ) {
    }

    /** GET /transfers */
    public function index(Request $request): Response
    {
        return $this->view('transfers.index', [
            'title' => 'Trasferimenti',
        ]);
    }

    /** GET /transfers/list */
    public function list(Request $request): Response
    {
        $userId  = $this->userId();
        $filters = [
            'date_from'  => $this->trimNullable($request->query('date_from')),
            'date_to'    => $this->trimNullable($request->query('date_to')),
            'account_id' => (int) ($request->query('account_id') ?? 0) ?: null,
            'limit'      => (int) ($request->query('limit')  ?? 200),
            'offset'     => (int) ($request->query('offset') ?? 0),
        ];
        $rows = $this->service->repository()->list($userId, $filters);
        return $this->json(['transfers' => array_map(static fn($t) => $t->toArray(), $rows)]);
    }

    /** POST /transfers/create */
    public function create(Request $request): Response
    {
        $userId  = $this->userId();
        $entity  = $this->service->create($userId, [
            'source_account_id'      => $request->input('source_account_id'),
            'destination_account_id' => $request->input('destination_account_id'),
            'amount'                 => $request->input('amount'),
            'transfer_date'          => $request->input('transfer_date'),
            'description'            => $request->input('description'),
            'notes'                  => $request->input('notes'),
        ]);
        return $this->json(['transfer' => $entity->toArray()]);
    }

    /** POST /transfers/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID trasferimento mancante.');
        }
        $this->service->delete($id, $userId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    private function trimNullable(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }
}
