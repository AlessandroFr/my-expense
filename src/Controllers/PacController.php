<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Services\PacService;

/**
 * Controller per il dominio PAC (Piano di Accumulo Capitale).
 */
final class PacController extends BaseController
{
    public function __construct(
        private readonly PacService $service = new PacService(),
    ) {
    }

    /** GET /pac */
    public function index(Request $request): Response
    {
        return $this->view('pac.index', ['title' => 'Piani di Accumulo']);
    }

    /** GET /pac/plan?id=N */
    public function planPage(Request $request): Response
    {
        $userId = $this->userId();
        $id = (int) ($request->query('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID piano mancante.');
        }
        $plan = $this->service->plansRepo()->findById($id, $userId);
        if ($plan === null) {
            throw HttpException::notFound('Piano non trovato.');
        }
        return $this->view('pac.plan', [
            'title' => $plan->name,
            'plan'  => $plan->toArray(),
        ]);
    }

    // ─── Funds ──────────────────────────────────────────────────────────────

    public function listFunds(Request $request): Response
    {
        $userId = $this->userId();
        $rows = $this->service->fundsRepo()->listForUser(
            $userId,
            (bool) (int) ($request->query('include_archived') ?? 0),
        );
        return $this->json(['funds' => array_map(static fn($f) => $f->toArray(), $rows)]);
    }

    public function createFund(Request $request): Response
    {
        $userId = $this->userId();
        $entity = $this->service->createFund($userId, [
            'name'           => $request->input('name'),
            'isin'           => $request->input('isin'),
            'asset_class_id' => $request->input('asset_class_id'),
            'fund_type'      => $request->input('fund_type'),
            'currency'       => $request->input('currency'),
            'notes'          => $request->input('notes'),
        ]);
        return $this->json(['fund' => $entity->toArray()]);
    }

    public function updateFund(Request $request): Response
    {
        $userId = $this->userId();
        $id = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID fondo mancante.');
        }
        $entity = $this->service->updateFund($id, $userId, [
            'name'           => $request->input('name'),
            'isin'           => $request->input('isin'),
            'asset_class_id' => $request->input('asset_class_id'),
            'fund_type'      => $request->input('fund_type'),
            'currency'       => $request->input('currency'),
            'notes'          => $request->input('notes'),
            'archived'       => (int) (bool) ($request->input('archived') ?? 0),
        ]);
        return $this->json(['fund' => $entity->toArray()]);
    }

    public function deleteFund(Request $request): Response
    {
        $userId = $this->userId();
        $id = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID fondo mancante.');
        }
        $this->service->deleteFund($id, $userId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    public function listNavs(Request $request): Response
    {
        $userId = $this->userId();
        $fundId = (int) ($request->query('fund_id') ?? 0);
        if ($fundId <= 0) {
            throw HttpException::badRequest('ID fondo mancante.');
        }
        if ($this->service->fundsRepo()->findById($fundId, $userId) === null) {
            throw HttpException::notFound('Fondo non trovato.');
        }
        return $this->json(['navs' => $this->service->fundsRepo()->navHistory($fundId)]);
    }

    public function updateNav(Request $request): Response
    {
        $userId = $this->userId();
        $fundId = (int) ($request->input('fund_id') ?? 0);
        $nav    = (float) str_replace(',', '.', (string) ($request->input('nav') ?? 0));
        $date   = (string) ($request->input('nav_date') ?? date('Y-m-d'));
        if ($fundId <= 0) {
            throw HttpException::badRequest('ID fondo mancante.');
        }
        $this->service->updateNav($userId, $fundId, $date, $nav);
        return $this->json(['updated' => true, 'fund_id' => $fundId, 'nav_date' => $date]);
    }

    public function deleteNav(Request $request): Response
    {
        $userId = $this->userId();
        $fundId = (int) ($request->input('fund_id') ?? 0);
        $id     = (int) ($request->input('id') ?? 0);
        if ($fundId <= 0 || $id <= 0) {
            throw HttpException::badRequest('ID NAV o fondo mancante.');
        }
        if ($this->service->fundsRepo()->findById($fundId, $userId) === null) {
            throw HttpException::notFound('Fondo non trovato.');
        }
        $this->service->fundsRepo()->deleteNavById($id, $fundId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    // ─── Plans ──────────────────────────────────────────────────────────────

    public function listPlans(Request $request): Response
    {
        $userId = $this->userId();
        $onlyActive = (bool) (int) ($request->query('only_active') ?? 0);
        $rows = $this->service->plansRepo()->listForUser($userId, $onlyActive);

        $out = [];
        foreach ($rows as $plan) {
            $arr = $plan->toArray();
            $sum = $this->service->contributionsRepo()->summaryForPlan($plan->id);
            $arr['total_contributions'] = $sum['count'];
            $arr['total_amount']        = number_format($sum['total_amount'], 2, '.', '');
            $arr['total_units']         = number_format($sum['total_units'],  6, '.', '');
            $fund = $this->service->fundsRepo()->findById($plan->fundId, $userId);
            if ($fund !== null && $fund->lastNav !== null && $sum['total_units'] > 0) {
                $current = $sum['total_units'] * $fund->lastNav;
                $arr['current_value']  = number_format($current, 2, '.', '');
                $arr['unrealized_pnl'] = number_format($current - $sum['total_amount'], 2, '.', '');
            } else {
                $arr['current_value']  = null;
                $arr['unrealized_pnl'] = null;
            }
            $out[] = $arr;
        }
        return $this->json(['plans' => $out]);
    }

    public function createPlan(Request $request): Response
    {
        $userId = $this->userId();
        $entity = $this->service->createPlan($userId, [
            'name'                => $request->input('name'),
            'account_id'          => $request->input('account_id'),
            'source_account_id'   => $request->input('source_account_id'),
            'fund_id'             => $request->input('fund_id'),
            'frequency'           => $request->input('frequency'),
            'amount'              => $request->input('amount'),
            'start_date'          => $request->input('start_date'),
            'end_date'            => $request->input('end_date'),
            'beneficiary_iban'    => $request->input('beneficiary_iban'),
            'beneficiary_keyword' => $request->input('beneficiary_keyword'),
            'active'              => (int) (bool) ($request->input('active') ?? 1),
            'notes'               => $request->input('notes'),
        ]);
        return $this->json(['plan' => $entity->toArray()]);
    }

    public function updatePlan(Request $request): Response
    {
        $userId = $this->userId();
        $id = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID piano mancante.');
        }
        $entity = $this->service->updatePlan($id, $userId, [
            'name'                => $request->input('name'),
            'account_id'          => $request->input('account_id'),
            'source_account_id'   => $request->input('source_account_id'),
            'fund_id'             => $request->input('fund_id'),
            'frequency'           => $request->input('frequency'),
            'amount'              => $request->input('amount'),
            'start_date'          => $request->input('start_date'),
            'end_date'            => $request->input('end_date'),
            'beneficiary_iban'    => $request->input('beneficiary_iban'),
            'beneficiary_keyword' => $request->input('beneficiary_keyword'),
            'active'              => (int) (bool) ($request->input('active') ?? 1),
            'notes'               => $request->input('notes'),
        ]);
        return $this->json(['plan' => $entity->toArray()]);
    }

    public function togglePlan(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        $active = (bool) (int) ($request->input('active') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID piano mancante.');
        }
        $entity = $this->service->togglePlan($id, $userId, $active);
        return $this->json(['plan' => $entity->toArray()]);
    }

    public function deletePlan(Request $request): Response
    {
        $userId = $this->userId();
        $id = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID piano mancante.');
        }
        $this->service->deletePlan($id, $userId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }

    public function runPlan(Request $request): Response
    {
        $userId = $this->userId();
        $id = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID piano mancante.');
        }
        $created = $this->service->runPlanNow($id, $userId);
        return $this->json(['created' => $created]);
    }

    public function runPending(Request $request): Response
    {
        $userId  = $this->userId();
        $created = $this->service->generatePending($userId);
        return $this->json(['created' => $created]);
    }

    // ─── Contributions ──────────────────────────────────────────────────────

    public function listContributions(Request $request): Response
    {
        $userId = $this->userId();
        $rows = $this->service->contributionsRepo()->listForUser($userId, [
            'plan_id'   => (int) ($request->query('plan_id') ?? 0) ?: null,
            'date_from' => $request->query('date_from'),
            'date_to'   => $request->query('date_to'),
        ]);
        return $this->json(['contributions' => array_map(static fn($c) => $c->toArray(), $rows)]);
    }

    public function createContribution(Request $request): Response
    {
        $userId  = $this->userId();
        $planId  = (int) ($request->input('plan_id') ?? 0);
        $date    = (string) ($request->input('contribution_date') ?? date('Y-m-d'));
        $amount  = (float) str_replace(',', '.', (string) ($request->input('amount') ?? 0));
        $notes   = $request->input('notes');
        $notesS  = $notes === null ? null : trim((string) $notes);
        if ($notesS === '') $notesS = null;

        if ($planId <= 0) {
            throw HttpException::badRequest('ID piano mancante.');
        }
        $entity = $this->service->recordManualContribution($userId, $planId, $date, $amount, $notesS);
        if ($entity === null) {
            throw HttpException::conflict('Esiste gia\' un versamento per questa data sul piano.');
        }
        return $this->json(['contribution' => $entity->toArray()]);
    }

    public function deleteContribution(Request $request): Response
    {
        $userId = $this->userId();
        $id = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID versamento mancante.');
        }
        $this->service->deleteContribution($id, $userId);
        return $this->json(['deleted' => true, 'id' => $id]);
    }
}
