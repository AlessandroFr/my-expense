<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Account;
use App\Category;
use App\Contact;
use App\CsvService;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\Models\Entities\Expense;
use App\Services\ExpenseService;
use App\Validation\Requests\CreateExpenseRequest;
use App\Validation\Requests\UpdateExpenseRequest;
use Throwable;

/**
 * Controller delle Spese. Sostituisce i 6 file in public/endpoints/expenses_*.php
 * + la pagina public/pages/expenses.php (rimossi al cleanup C15).
 *
 * Le dipendenze legacy (Category::allForUser, Account::allForUser, Contact::allForUser,
 * Account::defaultCashFor, CsvService) restano in uso finche' i rispettivi domini
 * non vengono migrati nei commit successivi (C7, C11, C13, C14).
 */
final class ExpenseController extends BaseController
{
    private ExpenseService $service;

    public function __construct(?ExpenseService $service = null)
    {
        $this->service = $service ?? new ExpenseService();
    }

    /** GET /expenses -- pagina HTML con form/filtri/tabella popolata da JS. */
    public function index(Request $request): Response
    {
        $userId      = $this->userId();
        $categories  = Category::allForUser($userId);
        $accounts    = Account::allForUser($userId, false);
        $defaultCash = Account::defaultCashFor($userId);
        $contacts    = Contact::allForUser($userId, false, 'supplier');

        return $this->view('expenses.index', [
            'title'           => 'Spese',
            'categories'      => $categories,
            'accounts'        => $accounts,
            'defaultCash'     => $defaultCash,
            'contacts'        => $contacts,
            'paymentMethods'  => ExpenseService::PAYMENT_METHODS,
            'paymentLabels'   => [
                'cash'     => 'Contanti',
                'card'     => 'Carta',
                'transfer' => 'Bonifico',
                'other'    => 'Altro',
            ],
            'today'           => date('Y-m-d'),
        ]);
    }

    /** GET /expenses/list -- JSON envelope con array di spese filtrate. */
    public function list(Request $request): Response
    {
        $userId  = $this->userId();
        $filters = [
            'date_from'   => $request->query('date_from'),
            'date_to'     => $request->query('date_to'),
            'category_id' => $this->coerceNullableInt($request->query('category_id')),
            'account_id'  => $this->coerceNullableInt($request->query('account_id')),
            'contact_id'  => $this->coerceNullableInt($request->query('contact_id')),
            'amount_min'  => $request->query('amount_min'),
            'amount_max'  => $request->query('amount_max'),
            'search'      => $request->query('search'),
            'tag'         => $request->query('tag'),
            'limit'       => (int) ($request->query('limit') ?? 200),
            'offset'      => (int) ($request->query('offset') ?? 0),
        ];

        $repo  = $this->service->repository();
        $rows  = array_map(static fn(Expense $e): array => $e->toArray(), $repo->list($userId, $filters));
        $total = $repo->count($userId, $filters);

        // Arricchimento batch per le righe rateizzate: aggiunge group_count e
        // group_total (somma di tutte le rate del gruppo) per il tooltip badge.
        $instIds = [];
        foreach ($rows as $r) {
            if (!empty($r['installment_total']) && (int) $r['installment_total'] > 0) {
                $instIds[] = (int) $r['id'];
            }
        }
        if ($instIds !== []) {
            $summary = $repo->installmentGroupSummary($userId, $instIds);
            foreach ($rows as &$r) {
                $info = $summary[(int) $r['id']] ?? null;
                if ($info !== null) {
                    $r['installment_group_count'] = $info['group_count'];
                    $r['installment_group_total'] = $info['group_total'];
                }
            }
            unset($r);
        }

        return $this->json([
            'expenses' => $rows,
            'total'    => $total,
            'limit'    => (int) $filters['limit'],
            'offset'   => (int) $filters['offset'],
        ]);
    }

    /** POST /expenses/create */
    public function create(Request $request): Response
    {
        $userId = $this->userId();
        $clean  = $this->validated(CreateExpenseRequest::class, $request);
        // contact_name e' una stringa libera (form), passata al Service per findOrCreate.
        $clean['contact_name'] = $request->input('contact_name');
        // contact_id grezzo: il Service decide tra id e contact_name.
        $clean['contact_id'] = $request->input('contact_id', $clean['contact_id'] ?? null);

        $result = $this->service->create($userId, $clean);
        return $this->json([
            'expense'        => $result['expense']?->toArray(),
            'budget_warning' => $result['budget_warning'],
        ]);
    }

    /** POST /expenses/update */
    public function update(Request $request): Response
    {
        $userId = $this->userId();
        $clean  = $this->validated(UpdateExpenseRequest::class, $request);
        $clean['contact_name'] = $request->input('contact_name');
        $clean['contact_id']   = $request->input('contact_id', $clean['contact_id'] ?? null);

        $id     = (int) $clean['id'];
        $result = $this->service->update($id, $userId, $clean);
        return $this->json([
            'expense'        => $result['expense']?->toArray(),
            'budget_warning' => $result['budget_warning'],
        ]);
    }

    /** POST /expenses/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID spesa mancante.');
        }
        $this->service->delete($id, $userId);
        return $this->json(['id' => $id]);
    }

    /** GET /expenses/export -- CSV streamed (no JSON envelope) */
    public function export(Request $request): Response
    {
        $userId  = $this->userId();
        $filters = [
            'date_from'   => $request->query('date_from'),
            'date_to'     => $request->query('date_to'),
            'category_id' => $request->query('category_id'),
            'amount_min'  => $request->query('amount_min'),
            'amount_max'  => $request->query('amount_max'),
            'search'      => $request->query('search'),
            'limit'       => 5000,
            'offset'      => 0,
        ];
        $rows = array_map(
            static fn(Expense $e): array => $e->toArray(),
            $this->service->repository()->list($userId, $filters),
        );
        // CsvService::exportToStdout() emette i propri header (Content-Type/Disposition):
        // passiamo headers=[] per non sovrascriverli da Response.
        return Response::stream(static function () use ($rows): void {
            CsvService::exportToStdout($rows, 'expenses');
        }, []);
    }

    /** POST /expenses/import -- upload CSV semplice (Data;Categoria;Descrizione;Importo;Pagamento). */
    public function import(Request $request): Response
    {
        $userId = $this->userId();
        $create = (bool) (int) ($request->input('create_missing_categories') ?? 1);

        $file = $request->file('file');
        if ($file === null || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $code = $file['error'] ?? UPLOAD_ERR_NO_FILE;
            throw HttpException::badRequest('Upload fallito (codice ' . $code . ').');
        }
        $origName = (string) ($file['name'] ?? 'upload.csv');
        if (!preg_match('/\.csv$/i', $origName)) {
            throw HttpException::badRequest('Sono accettati solo file .csv.');
        }

        try {
            $result = CsvService::importFromUpload($userId, (string) $file['tmp_name'], $create);
        } catch (Throwable $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        return $this->json($result);
    }

    private function coerceNullableInt(mixed $raw): ?int
    {
        if ($raw === null || $raw === '' || $raw === '0' || $raw === 0) {
            return null;
        }
        return (int) $raw;
    }
}
