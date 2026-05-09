<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Account;
use App\Contact;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Models\Entities\Income;
use App\Services\IncomeService;
use App\Validation\Requests\CreateIncomeRequest;
use App\Validation\Requests\UpdateIncomeRequest;

/**
 * Controller delle entrate. Sostituisce incomes_*.php + pages/incomes.php.
 */
final class IncomeController extends BaseController
{
    private IncomeService $service;

    public function __construct(?IncomeService $service = null)
    {
        $this->service = $service ?? new IncomeService();
    }

    /** GET /incomes */
    public function index(Request $request): Response
    {
        $userId   = $this->userId();
        $accounts = Account::allForUser($userId, false);
        $contacts = Contact::allForUser($userId, false, 'customer');
        return $this->view('incomes.index', [
            'title'    => 'Entrate',
            'accounts' => $accounts,
            'contacts' => $contacts,
            'today'    => date('Y-m-d'),
        ]);
    }

    /** GET /incomes/list */
    public function list(Request $request): Response
    {
        $userId  = $this->userId();
        $filters = [
            'date_from'  => $request->query('date_from'),
            'date_to'    => $request->query('date_to'),
            'source'     => $request->query('source'),
            'account_id' => $this->coerceNullableInt($request->query('account_id')),
            'contact_id' => $this->coerceNullableInt($request->query('contact_id')),
            'search'     => $request->query('search'),
            'limit'      => (int) ($request->query('limit')  ?? 200),
            'offset'     => (int) ($request->query('offset') ?? 0),
        ];

        $repo    = $this->service->repository();
        $rows    = array_map(static fn(Income $i): array => $i->toArray(), $repo->list($userId, $filters));
        $total   = $repo->count($userId, $filters);
        $sources = $repo->distinctSources($userId);

        return $this->json([
            'incomes' => $rows,
            'total'   => $total,
            'sources' => $sources,
            'limit'   => (int) $filters['limit'],
            'offset'  => (int) $filters['offset'],
        ]);
    }

    /** POST /incomes/create */
    public function create(Request $request): Response
    {
        $userId = $this->userId();
        $clean  = $this->validated(CreateIncomeRequest::class, $request);
        $clean['contact_name'] = $request->input('contact_name');
        $clean['contact_id']   = $request->input('contact_id', $clean['contact_id'] ?? null);

        $entity = $this->service->create($userId, $clean);
        return $this->json(['income' => $entity->toArray()]);
    }

    /** POST /incomes/update */
    public function update(Request $request): Response
    {
        $userId = $this->userId();
        $clean  = $this->validated(UpdateIncomeRequest::class, $request);
        $clean['contact_name'] = $request->input('contact_name');
        $clean['contact_id']   = $request->input('contact_id', $clean['contact_id'] ?? null);

        $id     = (int) $clean['id'];
        $entity = $this->service->update($id, $userId, $clean);
        return $this->json(['income' => $entity->toArray()]);
    }

    /** POST /incomes/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID entrata mancante.');
        }
        $this->service->delete($id, $userId);
        return $this->json(['id' => $id]);
    }

    private function coerceNullableInt(mixed $raw): ?int
    {
        if ($raw === null || $raw === '' || $raw === '0' || $raw === 0) {
            return null;
        }
        return (int) $raw;
    }
}
