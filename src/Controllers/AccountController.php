<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Account as LegacyAccount;
use App\AccountReconciliation;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use InvalidArgumentException;
use RuntimeException;

/**
 * Controller dei conti + riconciliazione.
 *
 * Delega alle classi statiche legacy App\Account e App\AccountReconciliation
 * per preservare la logica transazionale gia' rodata (riconciliazione genera
 * Expense/Income di rettifica + record account_reconciliations in transaction).
 */
final class AccountController extends BaseController
{
    /** GET /accounts */
    public function index(Request $request): Response
    {
        return $this->view('accounts.index', [
            'title' => 'Conti',
        ]);
    }

    /** GET /accounts/list?include_archived=0|1 */
    public function list(Request $request): Response
    {
        $userId          = $this->userId();
        $includeArchived = (bool) (int) ($request->query('include_archived') ?? 0);
        $accounts        = LegacyAccount::withBalances($userId, $includeArchived);
        return $this->json(['accounts' => $accounts]);
    }

    /** POST /accounts/create */
    public function create(Request $request): Response
    {
        $userId = $this->userId();
        try {
            $id = LegacyAccount::create(
                $userId,
                (string) ($request->input('name') ?? ''),
                (string) ($request->input('type') ?? 'checking'),
                (string) ($request->input('color') ?? '#0d6efd'),
                $this->nullableString($request->input('icon')),
                (string) ($request->input('opening_balance') ?? '0'),
                (int) ($request->input('sort_order') ?? 0),
                $this->extractDetails($request),
                (bool) (int) ($request->input('is_default_cash') ?? 0),
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        } catch (RuntimeException $e) {
            throw HttpException::conflict($e->getMessage());
        }
        $row = LegacyAccount::findForUser($id, $userId);
        return $this->json(['account' => $row]);
    }

    /** POST /accounts/update */
    public function update(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID conto mancante.');
        }
        try {
            LegacyAccount::update(
                $id,
                $userId,
                (string) ($request->input('name') ?? ''),
                (string) ($request->input('type') ?? 'checking'),
                (string) ($request->input('color') ?? '#0d6efd'),
                $this->nullableString($request->input('icon')),
                (string) ($request->input('opening_balance') ?? '0'),
                (int) ($request->input('sort_order') ?? 0),
                (bool) (int) ($request->input('archived') ?? 0),
                $this->extractDetails($request),
                (bool) (int) ($request->input('is_default_cash') ?? 0),
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        } catch (RuntimeException $e) {
            throw HttpException::conflict($e->getMessage());
        }
        $row = LegacyAccount::findForUser($id, $userId);
        return $this->json(['account' => $row]);
    }

    /** POST /accounts/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID conto mancante.');
        }
        LegacyAccount::delete($id, $userId);
        return $this->json(['id' => $id]);
    }

    /** POST /accounts/reconcile */
    public function reconcile(Request $request): Response
    {
        $userId    = $this->userId();
        $accountId = (int) ($request->input('account_id') ?? 0);
        if ($accountId <= 0) {
            throw HttpException::badRequest('ID conto mancante.');
        }
        try {
            $row = AccountReconciliation::reconcile(
                $userId,
                $accountId,
                (string) ($request->input('declared_balance') ?? ''),
                (string) ($request->input('reconciled_at') ?? ''),
                $this->nullableString($request->input('notes')),
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        $newBalance = LegacyAccount::balanceFor($userId, $accountId);
        return $this->json([
            'reconciliation' => $row,
            'new_balance'    => round($newBalance, 2),
        ]);
    }

    /** GET /accounts/reconciliations?account_id=N */
    public function reconciliations(Request $request): Response
    {
        $userId    = $this->userId();
        $accountId = (int) ($request->query('account_id') ?? 0);
        if ($accountId <= 0) {
            throw HttpException::badRequest('ID conto mancante.');
        }
        $items = AccountReconciliation::listForAccount($userId, $accountId);
        return $this->json(['items' => $items]);
    }

    /** POST /accounts/reconciliation/delete */
    public function reconciliationDelete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID riconciliazione mancante.');
        }
        try {
            AccountReconciliation::delete($id, $userId);
        } catch (RuntimeException $e) {
            throw HttpException::notFound($e->getMessage());
        }
        return $this->json(['deleted' => true]);
    }

    private function nullableString(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }

    /** @return array<string,mixed> */
    private function extractDetails(Request $request): array
    {
        $out = [];
        foreach (['iban', 'bic', 'bank_name', 'account_holder', 'account_number', 'notes'] as $f) {
            $v = $request->input($f);
            $out[$f] = $v === null ? '' : (string) $v;
        }
        return $out;
    }
}
