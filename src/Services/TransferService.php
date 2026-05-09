<?php
declare(strict_types=1);

namespace App\Services;

use App\Account as LegacyAccount;
use App\Http\HttpException;
use App\Models\Entities\Transfer;
use RuntimeException;
use App\Models\Repositories\ExpenseRepository;
use App\Models\Repositories\IncomeRepository;
use App\Models\Repositories\TransferRepository;

/**
 * Service per i trasferimenti atomici fra conti.
 *
 * Un Transfer e' un bonifico interno fra due conti dell'utente. La create()
 * apre UNA transazione e scrive coerentemente 3 righe:
 *   - `transfers` (record di testa)
 *   - `expenses`  (uscita dal source, is_transfer=1, transfer_id=N)
 *   - `incomes`   (entrata sul destination, is_transfer=1, transfer_id=N)
 *
 * I KPI dashboard/reports filtrano `is_transfer=0` per non gonfiare i totali;
 * il saldo conto INVECE include i transfer (sono uscite/entrate vere).
 *
 * La cancellazione del Transfer rimuove in cascata expense+income via FK.
 */
final class TransferService extends BaseService
{
    /** Nome della categoria di sistema per le uscite-da-trasferimento. */
    public const CATEGORY_NAME = 'Trasferimento';

    /** Sorgente di sistema per le entrate-da-trasferimento. */
    public const INCOME_SOURCE = 'Trasferimento';

    public function __construct(
        private readonly TransferRepository $transfers = new TransferRepository(),
        private readonly ExpenseRepository $expenses = new ExpenseRepository(),
        private readonly IncomeRepository $incomes = new IncomeRepository(),
        private readonly CategoryService $categories = new CategoryService(),
    ) {
    }

    public function repository(): TransferRepository
    {
        return $this->transfers;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(int $userId, array $data): Transfer
    {
        $row = $this->normalize($userId, $data);

        return $this->transactional(function () use ($userId, $row) {
            $transferId = $this->transfers->create([
                'user_id'                => $userId,
                'source_account_id'      => $row['source_account_id'],
                'destination_account_id' => $row['destination_account_id'],
                'amount'                 => $row['amount'],
                'transfer_date'          => $row['transfer_date'],
                'description'            => $row['description'],
                'notes'                  => $row['notes'],
            ]);

            $category = $this->categories->findOrCreateByName(
                $userId,
                self::CATEGORY_NAME,
                '#6c757d',
                'arrow-left-right',
            );

            $expDesc = $row['description'] !== null
                ? sprintf('Trasferimento verso %s — %s', $row['destination_name'], $row['description'])
                : sprintf('Trasferimento verso %s', $row['destination_name']);
            $incDesc = $row['description'] !== null
                ? sprintf('Trasferimento da %s — %s', $row['source_name'], $row['description'])
                : sprintf('Trasferimento da %s', $row['source_name']);

            $this->expenses->create([
                'user_id'        => $userId,
                'category_id'    => $category->id,
                'contact_id'     => null,
                'account_id'     => $row['source_account_id'],
                'amount'         => $row['amount'],
                'description'    => $expDesc,
                'payment_method' => 'transfer',
                'expense_date'   => $row['transfer_date'],
                'is_transfer'    => 1,
                'transfer_id'    => $transferId,
            ]);

            $this->incomes->create([
                'user_id'        => $userId,
                'account_id'     => $row['destination_account_id'],
                'contact_id'     => null,
                'source'         => self::INCOME_SOURCE,
                'description'    => $incDesc,
                'amount'         => $row['amount'],
                'payment_method' => 'transfer',
                'income_date'    => $row['transfer_date'],
                'is_transfer'    => 1,
                'transfer_id'    => $transferId,
            ]);

            $entity = $this->transfers->findById($transferId, $userId);
            if ($entity === null) {
                throw new RuntimeException('Errore nel salvataggio del trasferimento.');
            }
            return $entity;
        });
    }

    public function delete(int $id, int $userId): void
    {
        $existing = $this->transfers->findById($id, $userId);
        if ($existing === null) {
            throw HttpException::notFound('Trasferimento non trovato.');
        }
        $this->transfers->deleteForUser($id, $userId);
    }

    /**
     * @param  array<string, mixed> $data
     * @return array{source_account_id:int,destination_account_id:int,amount:string,
     *               transfer_date:string,description:?string,notes:?string,
     *               source_name:string,destination_name:string}
     */
    private function normalize(int $userId, array $data): array
    {
        $sourceId = (int) ($data['source_account_id'] ?? 0);
        $destId   = (int) ($data['destination_account_id'] ?? 0);
        if ($sourceId <= 0 || $destId <= 0) {
            throw HttpException::badRequest('Devi selezionare conto sorgente e destinazione.');
        }
        if ($sourceId === $destId) {
            throw HttpException::badRequest("Conto sorgente e destinazione non possono coincidere.");
        }

        $source = LegacyAccount::findForUser($sourceId, $userId);
        $dest   = LegacyAccount::findForUser($destId,   $userId);
        if ($source === null || $dest === null) {
            throw HttpException::badRequest('Conto non trovato.');
        }

        $amountF = (float) str_replace(',', '.', (string) ($data['amount'] ?? 0));
        if ($amountF < 0.01 || $amountF > 99999999.99) {
            throw HttpException::badRequest('Importo non valido (minimo 0.01).');
        }

        $date = (string) ($data['transfer_date'] ?? '');
        if (!TransferRepository::isValidDate($date)) {
            throw HttpException::badRequest('Data non valida (formato YYYY-MM-DD).');
        }

        $description = $data['description'] ?? null;
        $description = $description === null ? null : trim((string) $description);
        if ($description === '') {
            $description = null;
        }
        if ($description !== null && mb_strlen($description) > 255) {
            throw HttpException::badRequest('Descrizione troppo lunga (max 255 caratteri).');
        }

        $notes = $data['notes'] ?? null;
        $notes = $notes === null ? null : trim((string) $notes);
        if ($notes === '') {
            $notes = null;
        }
        if ($notes !== null && mb_strlen($notes) > 255) {
            throw HttpException::badRequest('Note troppo lunghe (max 255 caratteri).');
        }

        return [
            'source_account_id'      => $sourceId,
            'destination_account_id' => $destId,
            'amount'                 => number_format($amountF, 2, '.', ''),
            'transfer_date'          => $date,
            'description'            => $description,
            'notes'                  => $notes,
            'source_name'            => (string) $source['name'],
            'destination_name'       => (string) $dest['name'],
        ];
    }
}
