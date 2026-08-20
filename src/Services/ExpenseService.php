<?php
declare(strict_types=1);

namespace App\Services;

use App\Budget;
use App\Contact;
use App\Database;
use App\Http\HttpException;
use App\Models\Entities\Expense;
use App\Models\Repositories\ExpenseRepository;
use InvalidArgumentException;

/**
 * Service per le spese. Orchestra la creazione/aggiornamento applicando le
 * regole di business non esprimibili come rules dichiarative:
 *  - cash payment richiede un account di tipo 'cash'
 *  - quota personale (share_amount) <= amount totale
 *  - category/account/contact devono appartenere allo user
 *
 * Le regole "shape" (tipi, formati, range) sono nelle Request classes
 * (Create/Update/Delete/List ExpenseRequest).
 *
 * Dipendenze legacy (saranno migrate in commit successivi):
 *  - App\Contact::findOrCreate    (C13)
 *  - App\Budget::checkForCategory (C8)
 */
final class ExpenseService extends BaseService
{
    public const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

    public function __construct(
        private readonly ExpenseRepository $expenses = new ExpenseRepository(),
    ) {
    }

    public function repository(): ExpenseRepository
    {
        return $this->expenses;
    }

    /**
     * @param array<string, mixed> $data  campi validati + contact_name opzionale
     *                                    + installment opzionale {count, frequency, custom_days?}
     * @return array{expense: ?Expense, budget_warning: array<string,mixed>|null, installments?: list<int>}
     */
    public function create(int $userId, array $data): array
    {
        $resolved    = $this->resolveContact($userId, $data);
        $row         = $this->normalizeAndValidate($userId, $resolved);
        $installment = $this->extractInstallmentSpec($data);

        if ($installment !== null) {
            return $this->createInstallmentSeries($userId, $row, $installment);
        }

        return $this->transactional(function () use ($userId, $row) {
            $id = $this->expenses->create([
                'user_id'        => $userId,
                'category_id'    => $row['category_id'],
                'contact_id'     => $row['contact_id'],
                'account_id'     => $row['account_id'],
                'amount'         => $row['amount'],
                'description'    => $row['description'],
                'shared_with'    => $row['shared_with'],
                'share_amount'   => $row['share_amount'],
                'payment_method' => $row['payment_method'],
                'expense_date'   => $row['expense_date'],
            ]);
            $entity  = $this->expenses->findById($id, $userId);
            $ym      = substr((string) $row['expense_date'], 0, 7);
            $warning = Budget::checkForCategory($userId, $row['category_id'], $ym);
            return ['expense' => $entity, 'budget_warning' => $warning];
        });
    }

    /**
     * Inserisce N rate in transazione. La #1 ha parent_expense_id NULL e
     * installment_seq=1; le successive puntano a id($1).
     *
     * @param array<string, mixed> $row          dati gia' normalizzati
     * @param array{count:int, frequency:string, custom_days:?int} $installment
     * @return array{expense: ?Expense, budget_warning: array<string,mixed>|null, installments: list<int>}
     */
    private function createInstallmentSeries(int $userId, array $row, array $installment): array
    {
        try {
            $spec  = InstallmentCalculator::validate($installment);
            $rates = InstallmentCalculator::explode(
                (string) $row['amount'],
                $spec['count'],
                (string) $row['expense_date'],
                $spec['frequency'],
                $spec['custom_days'],
            );
        } catch (InvalidArgumentException $e) {
            throw HttpException::badRequest($e->getMessage());
        }

        $count = $spec['count'];

        // share_amount: se l'utente l'ha indicato si applica solo come quota
        // della rata #1 (rappresenta la sua porzione del totale dichiarato);
        // ripeterlo sulle rate successive sarebbe semanticamente errato.
        // shared_with (testo libero "Marco, Luca") si replica su tutte.
        return $this->transactional(function () use ($userId, $row, $rates, $count) {
            $ids = [];
            foreach ($rates as $r) {
                $isFirst = $r['seq'] === 1;
                $payload = [
                    'user_id'           => $userId,
                    'category_id'       => $row['category_id'],
                    'contact_id'        => $row['contact_id'],
                    'account_id'        => $row['account_id'],
                    'amount'            => $r['amount'],
                    'description'       => $row['description'],
                    'shared_with'       => $row['shared_with'],
                    'share_amount'      => $isFirst ? $row['share_amount'] : null,
                    'payment_method'    => $row['payment_method'],
                    'expense_date'      => $r['date'],
                    'installment_seq'   => $r['seq'],
                    'installment_total' => $count,
                ];
                if (!$isFirst) {
                    $payload['parent_expense_id'] = $ids[0];
                }
                $ids[] = $this->expenses->create($payload);
            }
            $head    = $this->expenses->findById($ids[0], $userId);
            $ym      = substr((string) $row['expense_date'], 0, 7);
            $warning = Budget::checkForCategory($userId, $row['category_id'], $ym);
            return [
                'expense'        => $head,
                'budget_warning' => $warning,
                'installments'   => $ids,
            ];
        });
    }

    /**
     * Estrae lo spec rateizzazione dal payload se presente e attivo.
     * Accetta sia formato nested ($data['installment']) sia flat
     * ($data['installment_count']/'installment_frequency'/'installment_custom_days')
     * con flag $data['installment_enabled']. Se count<2 o spec assente, ritorna null.
     *
     * @param array<string, mixed> $data
     * @return array{count:int, frequency:string, custom_days:?int}|null
     */
    private function extractInstallmentSpec(array $data): ?array
    {
        if (isset($data['installment']) && is_array($data['installment'])) {
            $spec = $data['installment'];
        } else {
            $enabled = (string) ($data['installment_enabled'] ?? '');
            if ($enabled === '' || $enabled === '0') {
                return null;
            }
            $spec = [
                'count'       => (int) ($data['installment_count']       ?? 0),
                'frequency'   => (string) ($data['installment_frequency'] ?? 'monthly'),
                'custom_days' => isset($data['installment_custom_days']) && $data['installment_custom_days'] !== ''
                    ? (int) $data['installment_custom_days']
                    : null,
            ];
        }
        $count = (int) ($spec['count'] ?? 0);
        if ($count < 2) {
            return null;
        }
        return [
            'count'       => $count,
            'frequency'   => (string) ($spec['frequency'] ?? 'monthly'),
            'custom_days' => isset($spec['custom_days']) && $spec['custom_days'] !== ''
                ? (int) $spec['custom_days']
                : null,
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array{expense: ?Expense, budget_warning: array<string,mixed>|null}
     */
    public function update(int $id, int $userId, array $data): array
    {
        if ($this->expenses->findById($id, $userId) === null) {
            throw HttpException::notFound('Spesa non trovata.');
        }

        $resolved = $this->resolveContact($userId, $data);
        $row      = $this->normalizeAndValidate($userId, $resolved);

        return $this->transactional(function () use ($id, $userId, $row) {
            $this->expenses->updateForUser($id, $userId, [
                'category_id'    => $row['category_id'],
                'contact_id'     => $row['contact_id'],
                'account_id'     => $row['account_id'],
                'amount'         => $row['amount'],
                'description'    => $row['description'],
                'shared_with'    => $row['shared_with'],
                'share_amount'   => $row['share_amount'],
                'payment_method' => $row['payment_method'],
                'expense_date'   => $row['expense_date'],
            ]);
            $entity  = $this->expenses->findById($id, $userId);
            $ym      = substr((string) $row['expense_date'], 0, 7);
            $warning = Budget::checkForCategory($userId, $row['category_id'], $ym);
            return ['expense' => $entity, 'budget_warning' => $warning];
        });
    }

    public function delete(int $id, int $userId): void
    {
        $this->expenses->deleteForUser($id, $userId);
    }

    /**
     * Normalizza e valida i campi di dominio. Le rules "shape" sono gia' state
     * applicate dalla ValidatedRequest, qui applichiamo SOLO regole cross-entity
     * / business.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalizeAndValidate(int $userId, array $data): array
    {
        $amountF = (float) ($data['amount'] ?? 0);
        if ($amountF < 0.01 || $amountF > 99999999.99) {
            throw HttpException::badRequest('Importo non valido (minimo 0.01, massimo 99999999.99).');
        }

        $payment = (string) ($data['payment_method'] ?? 'card');
        if (!in_array($payment, self::PAYMENT_METHODS, true)) {
            throw HttpException::badRequest('Metodo di pagamento non valido.');
        }

        $expenseDate = (string) ($data['expense_date'] ?? '');
        if (!ExpenseRepository::isValidDate($expenseDate)) {
            throw HttpException::badRequest('Data non valida (formato richiesto: YYYY-MM-DD).');
        }

        $description = $data['description'] ?? null;
        $description = $description === null ? null : trim((string) $description);
        if ($description === '') {
            $description = null;
        }
        if ($description !== null && mb_strlen($description) > 8192) {
            throw HttpException::badRequest('Descrizione troppo lunga (max 8192 caratteri).');
        }

        $categoryId = $this->coerceNullableInt($data['category_id'] ?? null);
        if ($categoryId !== null) {
            $this->ensureOwnedExists($userId, 'categories', $categoryId, 'Categoria non trovata.');
        }

        $contactId = $this->coerceNullableInt($data['contact_id'] ?? null);
        if ($contactId !== null) {
            $this->ensureOwnedExists($userId, 'contacts', $contactId, 'Anagrafica non trovata.');
        }

        $accountType = null;
        $accountId   = $this->coerceNullableInt($data['account_id'] ?? null);
        if ($accountId !== null) {
            $accountType = $this->fetchAccountType($userId, $accountId);
            if ($accountType === null) {
                throw HttpException::badRequest('Conto non trovato.');
            }
        }

        if ($payment === 'cash') {
            if ($accountId === null) {
                throw HttpException::badRequest('Per i pagamenti in contanti devi selezionare un conto cassa.');
            }
            if ($accountType !== 'cash') {
                throw HttpException::badRequest("Il conto selezionato non e' un conto cassa: scegli \"In tasca\" o un altro conto Contanti.");
            }
        }

        $sharedWith = $data['shared_with'] ?? null;
        $sharedWith = $sharedWith === null ? null : trim((string) $sharedWith);
        if ($sharedWith === '') {
            $sharedWith = null;
        }
        if ($sharedWith !== null && mb_strlen($sharedWith) > 255) {
            throw HttpException::badRequest('Lista "Condiviso con" troppo lunga.');
        }

        $shareNorm = null;
        $shareRaw  = $data['share_amount'] ?? null;
        if ($shareRaw !== null && $shareRaw !== '') {
            $shareF = (float) $shareRaw;
            if ($shareF < 0.01) {
                throw HttpException::badRequest('Quota personale non valida.');
            }
            if ($shareF > $amountF) {
                throw HttpException::badRequest("La tua quota non puo' superare il totale.");
            }
            $shareNorm = number_format($shareF, 2, '.', '');
        }

        return [
            'category_id'    => $categoryId,
            'contact_id'     => $contactId,
            'account_id'     => $accountId,
            'amount'         => number_format($amountF, 2, '.', ''),
            'description'    => $description,
            'shared_with'    => $sharedWith,
            'share_amount'   => $shareNorm,
            'payment_method' => $payment,
            'expense_date'   => $expenseDate,
        ];
    }

    /**
     * Risolve il contatto: se `contact_id` e' presente lo usa; altrimenti se
     * e' presente `contact_name` (input free-text dal form) crea/recupera tramite
     * Contact::findOrCreate (legacy, sara' migrato in C13).
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function resolveContact(int $userId, array $data): array
    {
        $contactRaw  = $data['contact_id']   ?? '';
        $contactName = trim((string) ($data['contact_name'] ?? ''));

        if ($contactRaw !== '' && $contactRaw !== '0' && $contactRaw !== null) {
            $data['contact_id'] = (int) $contactRaw;
            return $data;
        }
        if ($contactName !== '') {
            try {
                $data['contact_id'] = Contact::findOrCreate($userId, $contactName, 'supplier');
            } catch (InvalidArgumentException $e) {
                throw HttpException::badRequest($e->getMessage());
            }
        } else {
            $data['contact_id'] = null;
        }
        return $data;
    }

    private function coerceNullableInt(mixed $raw): ?int
    {
        if ($raw === null || $raw === '' || $raw === '0' || $raw === 0) {
            return null;
        }
        return (int) $raw;
    }

    private function ensureOwnedExists(int $userId, string $table, int $id, string $message): void
    {
        $stmt = Database::pdo()->prepare("SELECT 1 FROM `{$table}` WHERE id = ? AND user_id = ? LIMIT 1");
        $stmt->execute([$id, $userId]);
        if ($stmt->fetchColumn() === false) {
            throw HttpException::badRequest($message);
        }
    }

    private function fetchAccountType(int $userId, int $accountId): ?string
    {
        $stmt = Database::pdo()->prepare('SELECT type FROM accounts WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$accountId, $userId]);
        $type = $stmt->fetchColumn();
        return $type === false ? null : (string) $type;
    }
}
