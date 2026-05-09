<?php
declare(strict_types=1);

namespace App\Services;

use App\Contact;
use App\Database;
use App\Http\HttpException;
use App\Models\Entities\Income;
use App\Models\Repositories\IncomeRepository;
use InvalidArgumentException;

/**
 * Service per le entrate.
 */
final class IncomeService extends BaseService
{
    public function __construct(
        private readonly IncomeRepository $repo = new IncomeRepository(),
    ) {
    }

    public function repository(): IncomeRepository
    {
        return $this->repo;
    }

    /** @param array<string,mixed> $data */
    public function create(int $userId, array $data): Income
    {
        $resolved = $this->resolveContact($userId, $data, 'customer');
        $row      = $this->normalize($resolved);

        $accountId = $this->coerceNullableInt($resolved['account_id'] ?? null);
        if ($accountId !== null) {
            $this->ensureAccount($userId, $accountId);
        }
        $contactId = $this->coerceNullableInt($resolved['contact_id'] ?? null);
        if ($contactId !== null) {
            $this->ensureOwned($userId, 'contacts', $contactId, 'Anagrafica non trovata.');
        }

        $id = $this->repo->create([
            'user_id'     => $userId,
            'account_id'  => $accountId,
            'contact_id'  => $contactId,
            'source'      => $row['source'],
            'description' => $row['description'],
            'amount'      => $row['amount'],
            'income_date' => $row['income_date'],
        ]);
        $entity = $this->repo->findById($id, $userId);
        if ($entity === null) {
            throw HttpException::notFound('Entrata non trovata dopo la creazione.');
        }
        return $entity;
    }

    /** @param array<string,mixed> $data */
    public function update(int $id, int $userId, array $data): Income
    {
        if ($this->repo->findById($id, $userId) === null) {
            throw HttpException::notFound('Entrata non trovata.');
        }
        $resolved = $this->resolveContact($userId, $data, 'customer');
        $row      = $this->normalize($resolved);

        $accountId = $this->coerceNullableInt($resolved['account_id'] ?? null);
        if ($accountId !== null) {
            $this->ensureAccount($userId, $accountId);
        }
        $contactId = $this->coerceNullableInt($resolved['contact_id'] ?? null);
        if ($contactId !== null) {
            $this->ensureOwned($userId, 'contacts', $contactId, 'Anagrafica non trovata.');
        }

        $this->repo->updateForUser($id, $userId, [
            'account_id'  => $accountId,
            'contact_id'  => $contactId,
            'source'      => $row['source'],
            'description' => $row['description'],
            'amount'      => $row['amount'],
            'income_date' => $row['income_date'],
        ]);
        $entity = $this->repo->findById($id, $userId);
        if ($entity === null) {
            throw HttpException::notFound('Entrata non trovata dopo l\'aggiornamento.');
        }
        return $entity;
    }

    public function delete(int $id, int $userId): void
    {
        $this->repo->deleteForUser($id, $userId);
    }

    /**
     * @param array<string,mixed> $data
     * @return array{source:string, description:?string, amount:string, income_date:string}
     */
    private function normalize(array $data): array
    {
        $source = trim((string) ($data['source'] ?? ''));
        if ($source === '' || mb_strlen($source) > 64) {
            throw HttpException::badRequest('Origine entrata obbligatoria (max 64 caratteri).');
        }

        $amountRaw = $data['amount'] ?? 0;
        $amountF = is_string($amountRaw) ? (float) str_replace(',', '.', $amountRaw) : (float) $amountRaw;
        if ($amountF < 0.01) {
            throw HttpException::badRequest('Importo non valido (minimo 0.01).');
        }
        if ($amountF > 99999999.99) {
            throw HttpException::badRequest('Importo troppo grande.');
        }

        $date = (string) ($data['income_date'] ?? '');
        if (!IncomeRepository::isValidDate($date)) {
            throw HttpException::badRequest('Data non valida (formato YYYY-MM-DD).');
        }

        $description = $data['description'] ?? null;
        $description = $description === null ? null : trim((string) $description);
        if ($description === '') {
            $description = null;
        }
        if ($description !== null && mb_strlen($description) > 8192) {
            throw HttpException::badRequest('Descrizione troppo lunga (max 8192 caratteri).');
        }

        return [
            'source'      => $source,
            'description' => $description,
            'amount'      => number_format($amountF, 2, '.', ''),
            'income_date' => $date,
        ];
    }

    /**
     * @param array<string,mixed> $data
     * @return array<string,mixed>
     */
    private function resolveContact(int $userId, array $data, string $type): array
    {
        $contactRaw  = $data['contact_id']   ?? '';
        $contactName = trim((string) ($data['contact_name'] ?? ''));
        if ($contactRaw !== '' && $contactRaw !== '0' && $contactRaw !== null) {
            $data['contact_id'] = (int) $contactRaw;
            return $data;
        }
        if ($contactName !== '') {
            try {
                $data['contact_id'] = Contact::findOrCreate($userId, $contactName, $type);
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

    private function ensureOwned(int $userId, string $table, int $id, string $message): void
    {
        $stmt = Database::pdo()->prepare("SELECT 1 FROM `{$table}` WHERE id = ? AND user_id = ? LIMIT 1");
        $stmt->execute([$id, $userId]);
        if ($stmt->fetchColumn() === false) {
            throw HttpException::badRequest($message);
        }
    }

    private function ensureAccount(int $userId, int $accountId): void
    {
        $stmt = Database::pdo()->prepare('SELECT 1 FROM accounts WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$accountId, $userId]);
        if ($stmt->fetchColumn() === false) {
            throw HttpException::badRequest('Conto non trovato.');
        }
    }
}
