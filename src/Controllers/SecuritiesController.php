<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Services\SecuritiesService;

/**
 * Controller per il dominio Investimenti (strumenti, transazioni titoli,
 * holdings, prezzi, asset class).
 */
final class SecuritiesController extends BaseController
{
    public function __construct(
        private readonly SecuritiesService $service = new SecuritiesService(),
    ) {
    }

    /** GET /securities */
    public function index(Request $request): Response
    {
        $userId = $this->userId();
        $this->service->ensureDefaultAssetClasses($userId);
        return $this->view('securities.index', ['title' => 'Investimenti']);
    }

    /** GET /securities/instrument?id=N */
    public function instrumentPage(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->query('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID strumento mancante.');
        }
        $entity = $this->service->instrumentsRepo()->findById($id, $userId);
        if ($entity === null) {
            throw HttpException::notFound('Strumento non trovato.');
        }
        return $this->view('securities.instrument', [
            'title'      => $entity->name,
            'instrument' => $entity->toArray(),
        ]);
    }

    // ─── Instruments ────────────────────────────────────────────────────────

    /** GET /securities/list */
    public function listInstruments(Request $request): Response
    {
        $userId  = $this->userId();
        $rows    = $this->service->instrumentsRepo()->listForUser($userId, [
            'account_id'       => (int) ($request->query('account_id') ?? 0) ?: null,
            'asset_class_id'   => (int) ($request->query('asset_class_id') ?? 0) ?: null,
            'include_archived' => (bool) (int) ($request->query('include_archived') ?? 0),
        ]);
        return $this->json(['instruments' => array_map(static fn($i) => $i->toArray(), $rows)]);
    }

    /** GET /securities/holdings */
    public function holdings(Request $request): Response
    {
        $userId    = $this->userId();
        $accountId = (int) ($request->query('account_id') ?? 0) ?: null;
        return $this->json([
            'holdings' => $this->service->holdings($userId, $accountId),
        ]);
    }

    /** POST /securities/instrument/create */
    public function createInstrument(Request $request): Response
    {
        $userId = $this->userId();
        $entity = $this->service->createInstrument($userId, [
            'account_id'     => $request->input('account_id'),
            'asset_class_id' => $request->input('asset_class_id'),
            'isin'           => $request->input('isin'),
            'ticker'         => $request->input('ticker'),
            'name'           => $request->input('name'),
            'currency'       => $request->input('currency'),
            'notes'          => $request->input('notes'),
        ]);
        return $this->json(['instrument' => $entity->toArray()]);
    }

    /** POST /securities/instrument/update */
    public function updateInstrument(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID strumento mancante.');
        }
        $entity = $this->service->updateInstrument($id, $userId, [
            'account_id'     => $request->input('account_id'),
            'asset_class_id' => $request->input('asset_class_id'),
            'isin'           => $request->input('isin'),
            'ticker'         => $request->input('ticker'),
            'name'           => $request->input('name'),
            'currency'       => $request->input('currency'),
            'notes'          => $request->input('notes'),
            'archived'       => (int) (bool) ($request->input('archived') ?? 0),
        ]);
        return $this->json(['instrument' => $entity->toArray()]);
    }

    /** POST /securities/instrument/archive */
    public function archiveInstrument(Request $request): Response
    {
        $userId   = $this->userId();
        $id       = (int) ($request->input('id') ?? 0);
        $archived = (int) (bool) ($request->input('archived') ?? 1);
        if ($id <= 0) {
            throw HttpException::badRequest('ID strumento mancante.');
        }
        $current = $this->service->instrumentsRepo()->findById($id, $userId);
        if ($current === null) {
            throw HttpException::notFound('Strumento non trovato.');
        }
        $entity = $this->service->updateInstrument($id, $userId, [
            'account_id'     => $current->accountId,
            'asset_class_id' => $current->assetClassId,
            'isin'           => $current->isin,
            'ticker'         => $current->ticker,
            'name'           => $current->name,
            'currency'       => $current->currency,
            'notes'          => $current->notes,
            'archived'       => $archived,
        ]);
        return $this->json(['instrument' => $entity->toArray()]);
    }

    /** POST /securities/instrument/delete */
    public function deleteInstrument(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID strumento mancante.');
        }
        $this->service->deleteInstrument($id, $userId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    // ─── Transactions ───────────────────────────────────────────────────────

    /** GET /securities/transactions/list */
    public function listTransactions(Request $request): Response
    {
        $userId = $this->userId();
        $rows   = $this->service->transactionsRepo()->listForUser($userId, [
            'account_id'    => (int) ($request->query('account_id')    ?? 0) ?: null,
            'instrument_id' => (int) ($request->query('instrument_id') ?? 0) ?: null,
            'kind'          => $this->trimNullable($request->query('kind')),
            'date_from'     => $this->trimNullable($request->query('date_from')),
            'date_to'       => $this->trimNullable($request->query('date_to')),
        ]);
        return $this->json(['transactions' => array_map(static fn($t) => $t->toArray(), $rows)]);
    }

    /** POST /securities/transactions/create */
    public function createTransaction(Request $request): Response
    {
        $userId = $this->userId();
        $entity = $this->service->recordTransaction($userId, [
            'account_id'      => $request->input('account_id'),
            'instrument_id'   => $request->input('instrument_id'),
            'kind'            => $request->input('kind'),
            'trade_date'      => $request->input('trade_date'),
            'settlement_date' => $request->input('settlement_date'),
            'quantity'        => $request->input('quantity'),
            'price'           => $request->input('price'),
            'fee'             => $request->input('fee'),
            'tax_withheld'    => $request->input('tax_withheld'),
            'notes'           => $request->input('notes'),
        ]);
        return $this->json(['transaction' => $entity->toArray()]);
    }

    /** POST /securities/transactions/delete */
    public function deleteTransaction(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID operazione mancante.');
        }
        $this->service->deleteTransaction($id, $userId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    // ─── Prices ─────────────────────────────────────────────────────────────

    /** GET /securities/prices?instrument_id=N */
    public function listPrices(Request $request): Response
    {
        $userId       = $this->userId();
        $instrumentId = (int) ($request->query('instrument_id') ?? 0);
        if ($instrumentId <= 0) {
            throw HttpException::badRequest('ID strumento mancante.');
        }
        if ($this->service->instrumentsRepo()->findById($instrumentId, $userId) === null) {
            throw HttpException::notFound('Strumento non trovato.');
        }
        $rows = $this->service->pricesRepo()->forInstrument($instrumentId);
        return $this->json(['prices' => array_map(static fn($p) => $p->toArray(), $rows)]);
    }

    /** POST /securities/prices/update */
    public function updatePrice(Request $request): Response
    {
        $userId       = $this->userId();
        $instrumentId = (int) ($request->input('instrument_id') ?? 0);
        if ($instrumentId <= 0) {
            throw HttpException::badRequest('ID strumento mancante.');
        }
        $price = (float) str_replace(',', '.', (string) ($request->input('price') ?? 0));
        $date  = (string) ($request->input('price_date') ?? date('Y-m-d'));
        $this->service->updatePrice($userId, $instrumentId, $date, $price);
        return $this->json(['updated' => true, 'instrument_id' => $instrumentId, 'price_date' => $date]);
    }

    /** POST /securities/prices/delete */
    public function deletePrice(Request $request): Response
    {
        $userId       = $this->userId();
        $instrumentId = (int) ($request->input('instrument_id') ?? 0);
        $id           = (int) ($request->input('id') ?? 0);
        if ($instrumentId <= 0 || $id <= 0) {
            throw HttpException::badRequest('ID prezzo o strumento mancante.');
        }
        if ($this->service->instrumentsRepo()->findById($instrumentId, $userId) === null) {
            throw HttpException::notFound('Strumento non trovato.');
        }
        $this->service->pricesRepo()->deleteById($id, $instrumentId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    // ─── Asset classes ──────────────────────────────────────────────────────

    /** GET /securities/asset-classes */
    public function listAssetClasses(Request $request): Response
    {
        $userId = $this->userId();
        $this->service->ensureDefaultAssetClasses($userId);
        $rows = $this->service->assetClassesRepo()->allForUser($userId);
        return $this->json(['asset_classes' => array_map(static fn($c) => $c->toArray(), $rows)]);
    }

    /** POST /securities/asset-classes/create */
    public function createAssetClass(Request $request): Response
    {
        $userId = $this->userId();
        $entity = $this->service->createAssetClass($userId, [
            'name'       => $request->input('name'),
            'color'      => $request->input('color'),
            'icon'       => $request->input('icon'),
            'sort_order' => (int) ($request->input('sort_order') ?? 100),
        ]);
        return $this->json(['asset_class' => $entity->toArray()]);
    }

    /** POST /securities/asset-classes/update */
    public function updateAssetClass(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID classe mancante.');
        }
        $entity = $this->service->updateAssetClass($id, $userId, [
            'name'       => $request->input('name'),
            'color'      => $request->input('color'),
            'icon'       => $request->input('icon'),
            'sort_order' => (int) ($request->input('sort_order') ?? 100),
        ]);
        return $this->json(['asset_class' => $entity->toArray()]);
    }

    /** POST /securities/asset-classes/delete */
    public function deleteAssetClass(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID classe mancante.');
        }
        $this->service->deleteAssetClass($id, $userId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    private function trimNullable(mixed $v): ?string
    {
        if ($v === null) return null;
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }
}
