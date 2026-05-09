<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Contact;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;
use App\RecurringExpense as LegacyRecurring;
use InvalidArgumentException;

/**
 * Controller delle spese ricorrenti. Delega a App\RecurringExpense per il
 * generatore di occorrenze pendenti (pattern advance-by-frequency).
 */
final class RecurringController extends BaseController
{
    /** GET /recurring */
    public function index(Request $request): Response
    {
        $userId   = $this->userId();
        $contacts = Contact::allForUser($userId, false, 'supplier');
        return $this->view('recurring.index', [
            'title'    => 'Spese ricorrenti',
            'contacts' => $contacts,
            'today'    => date('Y-m-d'),
        ]);
    }

    /** GET /recurring/list */
    public function list(Request $request): Response
    {
        $userId = $this->userId();
        $items  = LegacyRecurring::listForUser($userId);
        return $this->json(['items' => $items]);
    }

    /** POST /recurring/create */
    public function create(Request $request): Response
    {
        $userId = $this->userId();
        $contactId = $this->resolveContact($userId, $request);

        try {
            $id = LegacyRecurring::create(
                $userId,
                $this->coerceNullableInt($request->input('category_id')),
                (string) ($request->input('amount') ?? '0'),
                $this->nullableString($request->input('description')),
                (string) ($request->input('payment_method') ?? 'card'),
                (string) ($request->input('frequency') ?? 'monthly'),
                (string) ($request->input('start_date') ?? ''),
                $this->nullableString($request->input('end_date')),
                $contactId,
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        $row = LegacyRecurring::findForUser($id, $userId);
        return $this->json(['recurring' => $row]);
    }

    /** POST /recurring/update */
    public function update(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID ricorrenza mancante.');
        }
        if (LegacyRecurring::findForUser($id, $userId) === null) {
            throw HttpException::notFound('Ricorrenza non trovata.');
        }
        $contactId = $this->resolveContact($userId, $request);

        try {
            LegacyRecurring::update(
                $id, $userId,
                $this->coerceNullableInt($request->input('category_id')),
                (string) ($request->input('amount') ?? '0'),
                $this->nullableString($request->input('description')),
                (string) ($request->input('payment_method') ?? 'card'),
                (string) ($request->input('frequency') ?? 'monthly'),
                (string) ($request->input('start_date') ?? ''),
                $this->nullableString($request->input('end_date')),
                $contactId,
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        }
        $row = LegacyRecurring::findForUser($id, $userId);
        return $this->json(['recurring' => $row]);
    }

    /** POST /recurring/toggle */
    public function toggle(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        $active = (bool) (int) ($request->input('active') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID ricorrenza mancante.');
        }
        LegacyRecurring::setActive($id, $userId, $active);
        return $this->json(['active' => $active]);
    }

    /** POST /recurring/delete */
    public function delete(Request $request): Response
    {
        $userId = $this->userId();
        $id     = (int) ($request->input('id') ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('ID ricorrenza mancante.');
        }
        LegacyRecurring::delete($id, $userId);
        return $this->json(['id' => $id]);
    }

    /** POST /recurring/run -- genera manualmente le occorrenze pendenti. */
    public function run(Request $request): Response
    {
        $userId  = $this->userId();
        $created = LegacyRecurring::generatePending($userId);
        return $this->json(['created' => $created]);
    }

    private function resolveContact(int $userId, Request $request): ?int
    {
        $contactName = trim((string) ($request->input('contact_name') ?? ''));
        $contactRaw  = $request->input('contact_id');
        if ($contactRaw !== '' && $contactRaw !== '0' && $contactRaw !== null) {
            return (int) $contactRaw;
        }
        if ($contactName !== '') {
            try {
                return Contact::findOrCreate($userId, $contactName, 'supplier');
            } catch (InvalidArgumentException $e) {
                throw HttpException::badRequest($e->getMessage());
            }
        }
        return null;
    }

    private function nullableString(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }

    private function coerceNullableInt(mixed $raw): ?int
    {
        if ($raw === null || $raw === '' || $raw === '0' || $raw === 0) {
            return null;
        }
        return (int) $raw;
    }
}
