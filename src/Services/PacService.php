<?php
declare(strict_types=1);

namespace App\Services;

use App\Account as LegacyAccount;
use App\Http\HttpException;
use App\Models\Entities\PacContribution;
use App\Models\Entities\PacFund;
use App\Models\Entities\PacPlan;
use App\Models\Repositories\PacContributionRepository;
use App\Models\Repositories\PacFundRepository;
use App\Models\Repositories\PacPlanRepository;
use DateTimeImmutable;
use InvalidArgumentException;
use RuntimeException;

/**
 * Service per il dominio PAC (fondi, piani periodici, contribuzioni).
 *
 * Responsabilita':
 *  - CRUD pac_funds + storico NAV
 *  - CRUD pac_plans (frequency monthly/weekly/quarterly/yearly)
 *  - generatePending(userId): per ogni piano attivo emette le contribuzioni
 *    mancanti dal last_generated_date a oggi (idempotente per UNIQUE
 *    (plan_id, contribution_date)). Per ogni contribuzione apre una
 *    transazione e produce: Transfer atomico (CC source -> conto PAC) +
 *    riga pac_contributions con units calcolate dal NAV alla data.
 *  - recordManualContribution(planId, date, amount): inserimento manuale
 *  - recordImportContribution(planId, date, amount, transferId): chiamato
 *    da BankStatementImporter quando riconosce un bonifico verso un PAC
 *    (per IBAN o keyword) e il Transfer e' gia' stato emesso.
 */
final class PacService extends BaseService
{
    public function __construct(
        private readonly PacFundRepository         $funds         = new PacFundRepository(),
        private readonly PacPlanRepository         $plans         = new PacPlanRepository(),
        private readonly PacContributionRepository $contributions = new PacContributionRepository(),
        private readonly TransferService           $transfers     = new TransferService(),
    ) {
    }

    public function fundsRepo():         PacFundRepository         { return $this->funds; }
    public function plansRepo():         PacPlanRepository         { return $this->plans; }
    public function contributionsRepo(): PacContributionRepository { return $this->contributions; }

    // ─── Fondi ───────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $data */
    public function createFund(int $userId, array $data): PacFund
    {
        $row = $this->normalizeFund($data);
        if ($this->funds->findByName($userId, $row['name']) !== null) {
            throw HttpException::conflict("Esiste gia' un fondo '{$row['name']}'.");
        }
        $id = $this->funds->create(array_merge($row, ['user_id' => $userId]));
        $entity = $this->funds->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore creazione fondo.');
        }
        return $entity;
    }

    /** @param array<string, mixed> $data */
    public function updateFund(int $id, int $userId, array $data): PacFund
    {
        if ($this->funds->findById($id, $userId) === null) {
            throw HttpException::notFound('Fondo non trovato.');
        }
        $row = $this->normalizeFund($data);
        $this->funds->updateForUser($id, $userId, $row);
        $entity = $this->funds->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore aggiornamento fondo.');
        }
        return $entity;
    }

    public function deleteFund(int $id, int $userId): void
    {
        $this->funds->deleteForUser($id, $userId);
    }

    public function updateNav(int $userId, int $fundId, string $navDate, float $nav): void
    {
        if ($this->funds->findById($fundId, $userId) === null) {
            throw HttpException::notFound('Fondo non trovato.');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $navDate)) {
            throw HttpException::badRequest('Data NAV non valida (YYYY-MM-DD).');
        }
        if ($nav <= 0) {
            throw HttpException::badRequest('NAV deve essere > 0.');
        }
        $this->funds->upsertNav($fundId, $navDate, number_format($nav, 6, '.', ''));
    }

    // ─── Piani ───────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $data */
    public function createPlan(int $userId, array $data): PacPlan
    {
        $row = $this->normalizePlan($userId, $data);
        $id = $this->plans->create(array_merge($row, ['user_id' => $userId]));
        $entity = $this->plans->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore creazione piano.');
        }
        return $entity;
    }

    /** @param array<string, mixed> $data */
    public function updatePlan(int $id, int $userId, array $data): PacPlan
    {
        if ($this->plans->findById($id, $userId) === null) {
            throw HttpException::notFound('Piano non trovato.');
        }
        $row = $this->normalizePlan($userId, $data);
        $this->plans->updateForUser($id, $userId, $row);
        $entity = $this->plans->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore aggiornamento piano.');
        }
        return $entity;
    }

    public function togglePlan(int $id, int $userId, bool $active): PacPlan
    {
        if ($this->plans->findById($id, $userId) === null) {
            throw HttpException::notFound('Piano non trovato.');
        }
        $this->plans->updateForUser($id, $userId, ['active' => $active ? 1 : 0]);
        return $this->plans->findById($id, $userId)
            ?? throw new RuntimeException('Errore toggle piano.');
    }

    public function deletePlan(int $id, int $userId): void
    {
        $this->plans->deleteForUser($id, $userId);
    }

    // ─── Contribuzioni ───────────────────────────────────────────────────────

    /**
     * Genera le contribuzioni pendenti per tutti i piani attivi dell'utente,
     * dal last_generated_date+step (o start_date) fino a oggi. Idempotente.
     *
     * @return int  numero contribuzioni effettivamente create.
     */
    public function generatePending(int $userId): int
    {
        $today = new DateTimeImmutable(date('Y-m-d'));
        $plans = $this->plans->activeForUser($userId);
        $created = 0;

        foreach ($plans as $plan) {
            if ($plan->sourceAccountId === null) {
                continue;
            }
            $cursor = $this->nextOccurrence(
                $plan->lastGeneratedDate === null ? null : new DateTimeImmutable($plan->lastGeneratedDate),
                new DateTimeImmutable($plan->startDate),
                $plan->frequency,
            );
            $endLimit = $plan->endDate !== null ? new DateTimeImmutable($plan->endDate) : null;

            $lastDate = null;
            while ($cursor <= $today && ($endLimit === null || $cursor <= $endLimit)) {
                $iso = $cursor->format('Y-m-d');
                $contribId = $this->createContributionAtomic($userId, $plan, $iso, 'auto');
                if ($contribId !== null) {
                    $created++;
                }
                $lastDate = $iso;
                $cursor   = $this->advance($cursor, $plan->frequency);
            }
            if ($lastDate !== null) {
                $this->plans->setLastGeneratedDate($plan->id, $userId, $lastDate);
            }
        }
        return $created;
    }

    /**
     * Versamento manuale extra: l'utente registra un versamento in una data
     * specifica (puo' coincidere con generatePending o esserne aggiuntivo).
     *
     * @return PacContribution|null  null se gia' presente per quella data (UNIQUE).
     */
    public function recordManualContribution(int $userId, int $planId, string $date, float $amount, ?string $notes = null): ?PacContribution
    {
        $plan = $this->plans->findById($planId, $userId);
        if ($plan === null) {
            throw HttpException::notFound('Piano non trovato.');
        }
        if ($plan->sourceAccountId === null) {
            throw HttpException::badRequest('Imposta il conto sorgente sul piano prima di versare.');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            throw HttpException::badRequest('Data non valida (YYYY-MM-DD).');
        }
        if ($amount <= 0) {
            throw HttpException::badRequest('Importo deve essere > 0.');
        }
        $planForAmount = new PacPlan(
            id: $plan->id,
            userId: $plan->userId,
            accountId: $plan->accountId,
            sourceAccountId: $plan->sourceAccountId,
            fundId: $plan->fundId,
            name: $plan->name,
            frequency: $plan->frequency,
            amount: $amount,
            startDate: $plan->startDate,
            endDate: $plan->endDate,
            lastGeneratedDate: $plan->lastGeneratedDate,
            beneficiaryIban: $plan->beneficiaryIban,
            beneficiaryKeyword: $plan->beneficiaryKeyword,
            active: $plan->active,
            notes: $notes ?? $plan->notes,
        );
        $id = $this->createContributionAtomic($userId, $planForAmount, $date, 'manual', $notes);
        if ($id === null) {
            return null;
        }
        return $this->contributions->findById($id, $userId);
    }

    /**
     * Registra una contribuzione PAC riconosciuta dal bank import.
     * Non apre alcun Transfer (puo' essere passato un transfer_id se gia'
     * emesso dall'importer). Idempotente.
     *
     * @return int|null  id della contribuzione, o null se gia' presente.
     */
    public function recordImportContribution(
        int $userId, int $planId, string $date, float $amount,
        ?int $transferId = null, ?string $notes = null
    ): ?int {
        $plan = $this->plans->findById($planId, $userId);
        if ($plan === null) {
            return null;
        }
        $nav   = $this->funds->navOnOrBefore($plan->fundId, $date);
        $units = ($nav !== null && $nav > 0) ? $amount / $nav : null;
        return $this->contributions->createIdempotent([
            'user_id'           => $userId,
            'plan_id'           => $planId,
            'contribution_date' => $date,
            'amount'            => number_format($amount, 2, '.', ''),
            'nav'               => $nav   !== null ? number_format($nav,   6, '.', '') : null,
            'units'             => $units !== null ? number_format($units, 6, '.', '') : null,
            'transfer_id'       => $transferId,
            'source'            => 'import',
            'notes'             => $notes,
        ]);
    }

    /**
     * Esegue la generazione "ora" per un singolo piano (bottone manuale).
     * @return int  numero contribuzioni create.
     */
    public function runPlanNow(int $id, int $userId): int
    {
        $plan = $this->plans->findById($id, $userId);
        if ($plan === null) {
            throw HttpException::notFound('Piano non trovato.');
        }
        if (!$plan->active) {
            throw HttpException::badRequest('Il piano e\' disattivato.');
        }
        if ($plan->sourceAccountId === null) {
            throw HttpException::badRequest('Imposta il conto sorgente sul piano prima di generare.');
        }
        $today  = new DateTimeImmutable(date('Y-m-d'));
        $cursor = $this->nextOccurrence(
            $plan->lastGeneratedDate === null ? null : new DateTimeImmutable($plan->lastGeneratedDate),
            new DateTimeImmutable($plan->startDate),
            $plan->frequency,
        );
        $endLimit = $plan->endDate !== null ? new DateTimeImmutable($plan->endDate) : null;
        $created  = 0;
        $lastDate = null;
        while ($cursor <= $today && ($endLimit === null || $cursor <= $endLimit)) {
            $iso = $cursor->format('Y-m-d');
            $contribId = $this->createContributionAtomic($userId, $plan, $iso, 'auto');
            if ($contribId !== null) {
                $created++;
            }
            $lastDate = $iso;
            $cursor   = $this->advance($cursor, $plan->frequency);
        }
        if ($lastDate !== null) {
            $this->plans->setLastGeneratedDate($plan->id, $userId, $lastDate);
        }
        return $created;
    }

    /**
     * Helper per il BankStatementImporter: riconosce se la riga di estratto
     * conto corrisponde a un piano PAC attivo. Confronta:
     *  - IBAN beneficiario presente nella descrizione (regex IBAN IT)
     *    contro `pac_plans.beneficiary_iban` dei piani attivi
     *  - keyword `pac_plans.beneficiary_keyword` (case-insensitive)
     *    nella descrizione
     *  - pattern di default: 'PAC', 'PIANO ACCUMULO', 'VANGUARD',
     *    'FINECO INVEST', 'MOLEINVEST', 'BUDDY' (case-insensitive)
     *
     * @return PacPlan|null  il primo piano matchato, o null se nessuno.
     */
    public function matchRowToPlan(int $userId, string $description): ?PacPlan
    {
        $upper = strtoupper($description);
        $plans = $this->plans->activeForUser($userId);
        if (empty($plans)) {
            return null;
        }

        // 1) match IBAN (formato IT/EU semplificato)
        if (preg_match('/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/', str_replace(' ', '', $upper), $m) === 1) {
            $iban = $m[0];
            foreach ($plans as $plan) {
                if ($plan->beneficiaryIban !== null && strtoupper($plan->beneficiaryIban) === $iban) {
                    return $plan;
                }
            }
        }
        // 2) match keyword utente
        foreach ($plans as $plan) {
            if ($plan->beneficiaryKeyword !== null && $plan->beneficiaryKeyword !== '') {
                if (str_contains($upper, strtoupper($plan->beneficiaryKeyword))) {
                    return $plan;
                }
            }
        }
        // 3) pattern di default — solo se il fallback non rischia falsi positivi
        $defaults = ['PIANO ACCUMULO', 'PAC ', 'VANGUARD', 'FINECO INVEST', 'MOLEINVEST', 'BUDDY'];
        foreach ($defaults as $needle) {
            if (str_contains($upper, $needle)) {
                // ritorna il primo piano attivo come "default match" se l'utente
                // ha un solo piano; altrimenti meglio non indovinare
                return count($plans) === 1 ? $plans[0] : null;
            }
        }
        return null;
    }

    public function deleteContribution(int $id, int $userId): void
    {
        $existing = $this->contributions->findById($id, $userId);
        if ($existing === null) {
            throw HttpException::notFound('Versamento non trovato.');
        }
        $this->transactional(function () use ($existing, $userId) {
            if ($existing->transferId !== null) {
                try {
                    $this->transfers->delete($existing->transferId, $userId);
                } catch (HttpException) {
                    // transfer gia' rimosso: prosegui
                }
            }
            $this->contributions->deleteForUser($existing->id, $userId);
        });
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    /**
     * Esegue in transazione: 1) Transfer atomico CC -> conto PAC,
     * 2) row pac_contributions con units calcolate dal NAV.
     * Ritorna l'id della contribuzione, o null se gia' presente per quella
     * data (UNIQUE).
     */
    private function createContributionAtomic(int $userId, PacPlan $plan, string $date, string $source, ?string $notes = null): ?int
    {
        $existing = $this->contributions->listForUser($userId, [
            'plan_id'   => $plan->id,
            'date_from' => $date,
            'date_to'   => $date,
            'limit'     => 1,
        ]);
        if (!empty($existing)) {
            return null;
        }

        return $this->transactional(function () use ($userId, $plan, $date, $source, $notes): ?int {
            $transfer = $this->transfers->create($userId, [
                'source_account_id'      => $plan->sourceAccountId,
                'destination_account_id' => $plan->accountId,
                'amount'                 => number_format($plan->amount, 2, '.', ''),
                'transfer_date'          => $date,
                'description'            => sprintf('PAC %s — versamento %s', $plan->name, $source),
                'notes'                  => $notes,
            ]);

            $nav   = $this->funds->navOnOrBefore($plan->fundId, $date);
            $units = ($nav !== null && $nav > 0) ? $plan->amount / $nav : null;

            return $this->contributions->createIdempotent([
                'user_id'           => $userId,
                'plan_id'           => $plan->id,
                'contribution_date' => $date,
                'amount'            => number_format($plan->amount, 2, '.', ''),
                'nav'               => $nav   !== null ? number_format($nav,   6, '.', '') : null,
                'units'             => $units !== null ? number_format($units, 6, '.', '') : null,
                'transfer_id'       => $transfer->id,
                'source'            => $source,
                'notes'             => $notes,
            ]);
        });
    }

    private function nextOccurrence(?DateTimeImmutable $lastGenerated, DateTimeImmutable $start, string $frequency): DateTimeImmutable
    {
        if ($lastGenerated === null) {
            return $start;
        }
        return $this->advance($lastGenerated, $frequency);
    }

    private function advance(DateTimeImmutable $d, string $frequency): DateTimeImmutable
    {
        return match ($frequency) {
            'weekly'    => $d->modify('+1 week'),
            'monthly'   => $d->modify('+1 month'),
            'quarterly' => $d->modify('+3 months'),
            'yearly'    => $d->modify('+1 year'),
            default     => throw new InvalidArgumentException('Frequenza non valida.'),
        };
    }

    /**
     * @param  array<string, mixed> $data
     * @return array{name:string, isin:?string, asset_class_id:?int, fund_type:string,
     *               currency:string, notes:?string, archived:int}
     */
    private function normalizeFund(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 128) {
            throw HttpException::badRequest('Nome fondo obbligatorio (max 128).');
        }
        $isin = $data['isin'] ?? null;
        $isin = $isin === null ? null : strtoupper(trim((string) $isin));
        if ($isin === '') $isin = null;
        if ($isin !== null && !preg_match('/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/', $isin)) {
            throw HttpException::badRequest('ISIN non valido.');
        }
        $type = strtolower((string) ($data['fund_type'] ?? 'etf'));
        if (!in_array($type, PacFund::TYPES, true)) {
            throw HttpException::badRequest('Tipo fondo non valido.');
        }
        $currency = strtoupper(trim((string) ($data['currency'] ?? 'EUR'))) ?: 'EUR';
        if (!preg_match('/^[A-Z]{3}$/', $currency)) {
            throw HttpException::badRequest('Currency non valida.');
        }
        $notes = $data['notes'] ?? null;
        $notes = $notes === null ? null : trim((string) $notes);
        if ($notes === '') $notes = null;

        $assetClassId = $this->coerceNullableInt($data['asset_class_id'] ?? null);

        return [
            'name'           => $name,
            'isin'           => $isin,
            'asset_class_id' => $assetClassId,
            'fund_type'      => $type,
            'currency'       => $currency,
            'notes'          => $notes,
            'archived'       => isset($data['archived']) ? (int) (bool) $data['archived'] : 0,
        ];
    }

    /**
     * @param  array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalizePlan(int $userId, array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 96) {
            throw HttpException::badRequest('Nome piano obbligatorio (max 96).');
        }
        $accountId = (int) ($data['account_id'] ?? 0);
        $fundId    = (int) ($data['fund_id']    ?? 0);
        if ($accountId <= 0 || $fundId <= 0) {
            throw HttpException::badRequest('Conto PAC e fondo obbligatori.');
        }
        $accountRow = LegacyAccount::findForUser($accountId, $userId);
        if ($accountRow === null) {
            throw HttpException::badRequest('Conto PAC non trovato.');
        }
        if ($accountRow['type'] !== 'pac') {
            throw HttpException::badRequest('Il conto destinazione deve essere di tipo PAC.');
        }
        if ($this->funds->findById($fundId, $userId) === null) {
            throw HttpException::badRequest('Fondo non trovato.');
        }

        $sourceId = $this->coerceNullableInt($data['source_account_id'] ?? null);
        if ($sourceId !== null) {
            if ($sourceId === $accountId) {
                throw HttpException::badRequest('Il conto sorgente non puo\' coincidere con il conto PAC.');
            }
            if (LegacyAccount::findForUser($sourceId, $userId) === null) {
                throw HttpException::badRequest('Conto sorgente non trovato.');
            }
        }

        $frequency = (string) ($data['frequency'] ?? 'monthly');
        if (!in_array($frequency, PacPlan::FREQUENCIES, true)) {
            throw HttpException::badRequest('Frequenza non valida.');
        }
        $amount = (float) str_replace(',', '.', (string) ($data['amount'] ?? 0));
        if ($amount < 0.01) {
            throw HttpException::badRequest('Importo non valido (>0.01).');
        }
        $startDate = (string) ($data['start_date'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) {
            throw HttpException::badRequest('Data inizio non valida (YYYY-MM-DD).');
        }
        $endDate = $data['end_date'] ?? null;
        $endDate = $endDate === null ? null : trim((string) $endDate);
        if ($endDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate ?? '')) {
            $endDate = null;
        }

        $iban = $data['beneficiary_iban'] ?? null;
        $iban = $iban === null ? null : strtoupper(preg_replace('/\s+/', '', (string) $iban));
        if ($iban === '') $iban = null;
        if ($iban !== null && !preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', $iban)) {
            throw HttpException::badRequest('IBAN beneficiario non valido.');
        }

        $keyword = $data['beneficiary_keyword'] ?? null;
        $keyword = $keyword === null ? null : trim((string) $keyword);
        if ($keyword === '') $keyword = null;
        if ($keyword !== null && mb_strlen($keyword) > 64) {
            throw HttpException::badRequest('Keyword troppo lunga (max 64).');
        }

        $notes = $data['notes'] ?? null;
        $notes = $notes === null ? null : trim((string) $notes);
        if ($notes === '') $notes = null;
        if ($notes !== null && mb_strlen($notes) > 255) {
            throw HttpException::badRequest('Note troppo lunghe.');
        }

        return [
            'account_id'          => $accountId,
            'source_account_id'   => $sourceId,
            'fund_id'             => $fundId,
            'name'                => $name,
            'frequency'           => $frequency,
            'amount'              => number_format($amount, 2, '.', ''),
            'start_date'          => $startDate,
            'end_date'            => $endDate,
            'beneficiary_iban'    => $iban,
            'beneficiary_keyword' => $keyword,
            'active'              => isset($data['active']) ? (int) (bool) $data['active'] : 1,
            'notes'               => $notes,
        ];
    }

    private function coerceNullableInt(mixed $raw): ?int
    {
        if ($raw === null || $raw === '' || $raw === '0' || $raw === 0) return null;
        return (int) $raw;
    }
}
