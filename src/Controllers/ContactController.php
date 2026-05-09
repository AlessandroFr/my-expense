<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Contact as LegacyContact;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use InvalidArgumentException;
use RuntimeException;

/**
 * Controller delle anagrafiche fornitori/clienti. Delega a App\Contact per la
 * logica complessa (balanceSummary, breakdownByCategory, movementsForUser,
 * reassignMovements transactionali).
 */
final class ContactController extends BaseController
{
    /** GET /contacts -- lista paginata. */
    public function index(Request $request): Response
    {
        return $this->view('contacts.index', ['title' => 'Anagrafiche']);
    }

    /** GET /contacts/detail?id=N */
    public function detail(Request $request): Response
    {
        $userId  = $this->userId();
        $id      = (int) ($request->query('id') ?? 0);
        $contact = $id > 0 ? LegacyContact::findForUser($id, $userId) : null;
        $year    = (int) ($request->query('year') ?? date('Y'));
        return $this->view('contacts.detail', [
            'title'   => 'Dettaglio anagrafica',
            'contact' => $contact,
            'year'    => $year,
        ]);
    }

    /** GET /contacts/list */
    public function list(Request $request): Response
    {
        $userId          = $this->userId();
        $includeArchived = (bool) (int) ($request->query('include_archived') ?? 0);
        $typeRaw         = (string) ($request->query('type') ?? '');
        $type            = ($typeRaw === 'supplier' || $typeRaw === 'customer') ? $typeRaw : null;
        $search          = trim((string) ($request->query('search') ?? ''));
        $page            = max(1, (int) ($request->query('page') ?? 1));
        $pageSize        = (int) ($request->query('page_size') ?? 25);
        if ($pageSize < 0)   $pageSize = 25;
        if ($pageSize > 200) $pageSize = 200;

        $opts = ['search' => $search === '' ? null : $search];
        if ($pageSize > 0) {
            $opts['limit']  = $pageSize;
            $opts['offset'] = ($page - 1) * $pageSize;
        }
        $items = LegacyContact::allForUser($userId, $includeArchived, $type, $opts);
        if ($pageSize > 0) {
            $total = LegacyContact::countForUser($userId, $includeArchived, [
                'search' => $search === '' ? null : $search,
            ]);
            $totalPages = (int) max(1, (int) ceil($total / $pageSize));
        } else {
            $total      = count($items);
            $totalPages = 1;
        }
        if ($pageSize > 0 && (int) ($request->query('with_usage') ?? 0) === 1) {
            foreach ($items as &$c) {
                $c['usage'] = LegacyContact::usageCount((int) $c['id'], $userId);
            }
            unset($c);
        }
        return $this->json([
            'contacts'    => $items,
            'total'       => $total,
            'page'        => $pageSize > 0 ? $page : 1,
            'page_size'   => $pageSize,
            'total_pages' => $totalPages,
        ]);
    }

    /** GET /contacts/balance */
    public function balance(Request $request): Response
    {
        $userId = $this->userId();
        $from = $request->query('from');
        $to   = $request->query('to');
        $from = is_string($from) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) ? $from : null;
        $to   = is_string($to)   && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)   ? $to   : null;
        if ($from === null || $to === null) {
            $year = (int) ($request->query('year') ?? date('Y'));
            if ($year < 1970 || $year > 2999) {
                $year = (int) date('Y');
            }
            $from = sprintf('%04d-01-01', $year);
            $to   = sprintf('%04d-12-31', $year);
        }
        $typeRaw = (string) ($request->query('type') ?? '');
        $type    = ($typeRaw === 'supplier' || $typeRaw === 'customer') ? $typeRaw : null;
        $contactId = (int) ($request->query('contact_id') ?? 0);

        if ($contactId > 0) {
            $contact = LegacyContact::findForUser($contactId, $userId);
            if ($contact === null) {
                throw HttpException::notFound('Anagrafica non trovata.');
            }
            $summary   = LegacyContact::balanceSummary($userId, $from, $to, null);
            $breakdown = LegacyContact::breakdownByCategory($userId, $contactId, $from, $to);
            $self = null;
            foreach ($summary as $row) {
                if ((int) $row['contact_id'] === $contactId) {
                    $self = $row;
                    break;
                }
            }
            return $this->json([
                'from' => $from, 'to' => $to,
                'contact' => $contact, 'totals' => $self, 'breakdown' => $breakdown,
            ]);
        }
        $summary = LegacyContact::balanceSummary($userId, $from, $to, $type);
        return $this->json(['from' => $from, 'to' => $to, 'type' => $type, 'summary' => $summary]);
    }

    /** GET /contacts/movements?contact_id=N */
    public function movements(Request $request): Response
    {
        $userId    = $this->userId();
        $contactId = (int) ($request->query('contact_id') ?? 0);
        if ($contactId <= 0) {
            throw HttpException::badRequest('ID anagrafica mancante.');
        }
        if (LegacyContact::findForUser($contactId, $userId) === null) {
            throw HttpException::notFound('Anagrafica non trovata.');
        }
        $page     = max(1, (int) ($request->query('page') ?? 1));
        $pageSize = (int) ($request->query('page_size') ?? 50);
        if ($pageSize < 1)   $pageSize = 50;
        if ($pageSize > 200) $pageSize = 200;
        $rows  = LegacyContact::movementsForUser($userId, $contactId, [
            'limit'  => $pageSize,
            'offset' => ($page - 1) * $pageSize,
        ]);
        $usage = LegacyContact::usageCount($contactId, $userId);
        $counts = [
            'expense'   => $usage['expenses'],
            'income'    => $usage['incomes'],
            'recurring' => $usage['recurring'],
            'total'     => $usage['total'],
        ];
        $totalPages = (int) max(1, (int) ceil($counts['total'] / $pageSize));
        return $this->json([
            'movements'   => $rows,
            'counts'      => $counts,
            'page'        => $page,
            'page_size'   => $pageSize,
            'total_pages' => $totalPages,
        ]);
    }

    /** POST /contacts/create */
    public function create(Request $request): Response
    {
        $userId = $this->userId();
        try {
            $id = LegacyContact::create(
                $userId,
                (string) ($request->input('name') ?? ''),
                (string) ($request->input('type') ?? 'both'),
                $this->extractDetails($request),
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        } catch (RuntimeException $e) {
            throw HttpException::conflict($e->getMessage());
        }
        return $this->json(['id' => $id]);
    }

    /** POST /contacts/update */
    public function update(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID anagrafica mancante.');
        }
        try {
            LegacyContact::update(
                $id, $userId,
                (string) ($request->input('name') ?? ''),
                (string) ($request->input('type') ?? 'both'),
                $this->extractDetails($request),
                (bool) (int) ($request->input('archived') ?? 0),
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        } catch (RuntimeException $e) {
            throw HttpException::conflict($e->getMessage());
        }
        return $this->json(['updated' => true]);
    }

    /** POST /contacts/archive */
    public function archive(Request $request): Response
    {
        $userId   = $this->userId();
        $id       = (int) ($request->input('id') ?? 0);
        $archived = (bool) (int) ($request->input('archived') ?? 1);
        if ($id <= 0) {
            throw HttpException::badRequest('ID anagrafica mancante.');
        }
        LegacyContact::archive($id, $userId, $archived);
        return $this->json(['archived' => $archived]);
    }

    /** POST /contacts/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID anagrafica mancante.');
        }
        LegacyContact::delete($id, $userId);
        return $this->json(['deleted' => true]);
    }

    /** POST /contacts/reassign */
    public function reassign(Request $request): Response
    {
        $userId          = $this->userId();
        $sourceContactId = (int) ($request->input('source_contact_id') ?? 0);
        $sourceAction    = (string) ($request->input('source_action') ?? 'leave');
        $itemsRaw        = (string) ($request->input('items') ?? '');

        if ($sourceContactId <= 0) {
            throw HttpException::badRequest('ID anagrafica sorgente mancante.');
        }
        $items = json_decode($itemsRaw, true);
        if (!is_array($items) || $items === []) {
            throw HttpException::badRequest('Nessun movimento selezionato.');
        }
        if (count($items) > 5000) {
            throw HttpException::badRequest('Troppi movimenti in una sola operazione (max 5000). Procedi a piccoli blocchi.');
        }

        try {
            $result = LegacyContact::reassignMovements($userId, $sourceContactId, $items, $sourceAction);
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        } catch (RuntimeException $e) {
            throw HttpException::conflict($e->getMessage());
        }
        return $this->json(['result' => $result]);
    }

    /** @return array<string,string> */
    private function extractDetails(Request $request): array
    {
        $out = [];
        foreach (['vat_number', 'iban', 'email', 'notes', 'color'] as $f) {
            $v = $request->input($f);
            $out[$f] = $v === null ? '' : (string) $v;
        }
        return $out;
    }
}
