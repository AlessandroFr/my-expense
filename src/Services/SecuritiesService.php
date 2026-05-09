<?php
declare(strict_types=1);

namespace App\Services;

use App\Account as LegacyAccount;
use App\Http\HttpException;
use App\Models\Entities\AssetClass;
use App\Models\Entities\SecurityInstrument;
use App\Models\Entities\SecurityTransaction;
use App\Models\Repositories\AssetClassRepository;
use App\Models\Repositories\ExpenseRepository;
use App\Models\Repositories\HoldingsRepository;
use App\Models\Repositories\IncomeRepository;
use App\Models\Repositories\SecurityInstrumentRepository;
use App\Models\Repositories\SecurityPriceRepository;
use App\Models\Repositories\SecurityTransactionRepository;
use App\Services\QuoteFetcher\ManualQuoteFetcher;
use App\Services\QuoteFetcher\QuoteFetcherInterface;
use RuntimeException;

/**
 * Service per il dominio Investimenti (conti `deposit`).
 *
 * Responsabilita':
 *  - Gestione strumenti (CRUD + lookup ISIN/ticker)
 *  - Asset class user-scoped (CRUD + ensureDefaults al primo conto deposito)
 *  - Registrazione operazioni titoli atomica:
 *      BUY/FEE   -> expenses con is_investment=1, transaction.expense_id linkato
 *      SELL/DIV  -> incomes,                       transaction.income_id  linkato
 *      SPLIT     -> aggiusta solo qty (no scrittura contabile)
 *  - Lettura holdings derivata via HoldingsRepository
 *  - Aggiornamento prezzi (manual o via QuoteFetcher pluggable)
 */
final class SecuritiesService extends BaseService
{
    public const DEFAULT_ASSET_CLASSES = [
        ['name' => 'Azionario',      'color' => '#0d6efd', 'icon' => 'graph-up-arrow', 'sort_order' => 10],
        ['name' => 'Obbligazionario','color' => '#6c757d', 'icon' => 'shield-check',   'sort_order' => 20],
        ['name' => 'Monetario',      'color' => '#20c997', 'icon' => 'cash-coin',      'sort_order' => 30],
        ['name' => 'Multi-asset',    'color' => '#6610f2', 'icon' => 'pie-chart',      'sort_order' => 40],
        ['name' => 'Immobiliare',    'color' => '#fd7e14', 'icon' => 'building',       'sort_order' => 50],
    ];

    public function __construct(
        private readonly SecurityInstrumentRepository  $instruments    = new SecurityInstrumentRepository(),
        private readonly SecurityTransactionRepository $transactions   = new SecurityTransactionRepository(),
        private readonly SecurityPriceRepository       $prices         = new SecurityPriceRepository(),
        private readonly AssetClassRepository          $assetClasses   = new AssetClassRepository(),
        private readonly HoldingsRepository            $holdingsRepo   = new HoldingsRepository(),
        private readonly ExpenseRepository             $expenses       = new ExpenseRepository(),
        private readonly IncomeRepository              $incomes        = new IncomeRepository(),
        private readonly CategoryService               $categories     = new CategoryService(),
        private readonly QuoteFetcherInterface         $quoteFetcher   = new ManualQuoteFetcher(),
    ) {
    }

    public function instrumentsRepo():     SecurityInstrumentRepository  { return $this->instruments; }
    public function transactionsRepo():    SecurityTransactionRepository { return $this->transactions; }
    public function pricesRepo():          SecurityPriceRepository       { return $this->prices; }
    public function assetClassesRepo():    AssetClassRepository          { return $this->assetClasses; }
    public function holdingsRepository():  HoldingsRepository            { return $this->holdingsRepo; }

    // ─── Asset classes ───────────────────────────────────────────────────────

    /**
     * Garantisce che l'utente abbia almeno le 5 asset class di default.
     * Idempotente: se esistono gia' (anche solo alcune) le altre vengono create.
     */
    public function ensureDefaultAssetClasses(int $userId): void
    {
        foreach (self::DEFAULT_ASSET_CLASSES as $cls) {
            if ($this->assetClasses->findByName($userId, $cls['name']) === null) {
                try {
                    $this->assetClasses->create(array_merge($cls, ['user_id' => $userId]));
                } catch (\PDOException) {
                    // race / unique violation -> ignore, gia' presente
                }
            }
        }
    }

    /** @param array<string, mixed> $data */
    public function createAssetClass(int $userId, array $data): AssetClass
    {
        $row = $this->normalizeAssetClass($data);
        if ($this->assetClasses->findByName($userId, $row['name']) !== null) {
            throw HttpException::conflict("Esiste gia' una classe '{$row['name']}'.");
        }
        $id = $this->assetClasses->create(array_merge($row, ['user_id' => $userId]));
        $entity = $this->assetClasses->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore nel salvataggio della classe.');
        }
        return $entity;
    }

    /** @param array<string, mixed> $data */
    public function updateAssetClass(int $id, int $userId, array $data): AssetClass
    {
        $existing = $this->assetClasses->findById($id, $userId);
        if ($existing === null) {
            throw HttpException::notFound('Classe non trovata.');
        }
        $row = $this->normalizeAssetClass($data);
        $this->assetClasses->updateForUser($id, $userId, $row);
        $entity = $this->assetClasses->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore aggiornamento classe.');
        }
        return $entity;
    }

    public function deleteAssetClass(int $id, int $userId): void
    {
        $this->assetClasses->deleteForUser($id, $userId);
    }

    // ─── Strumenti ───────────────────────────────────────────────────────────

    /** @param array<string, mixed> $data */
    public function createInstrument(int $userId, array $data): SecurityInstrument
    {
        $row = $this->normalizeInstrument($userId, $data);
        if ($row['isin'] !== null) {
            $dup = $this->instruments->findByIsinOrTicker($userId, $row['isin'], null);
            if ($dup !== null) {
                throw HttpException::conflict("Esiste gia' uno strumento con ISIN {$row['isin']}.");
            }
        }
        if ($row['ticker'] !== null) {
            $dup = $this->instruments->findByIsinOrTicker($userId, null, $row['ticker']);
            if ($dup !== null) {
                throw HttpException::conflict("Esiste gia' uno strumento con ticker {$row['ticker']}.");
            }
        }
        $id = $this->instruments->create(array_merge($row, ['user_id' => $userId]));
        $entity = $this->instruments->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore nel salvataggio dello strumento.');
        }
        return $entity;
    }

    /** @param array<string, mixed> $data */
    public function updateInstrument(int $id, int $userId, array $data): SecurityInstrument
    {
        $existing = $this->instruments->findById($id, $userId);
        if ($existing === null) {
            throw HttpException::notFound('Strumento non trovato.');
        }
        $row = $this->normalizeInstrument($userId, $data);
        $this->instruments->updateForUser($id, $userId, $row);
        $entity = $this->instruments->findById($id, $userId);
        if ($entity === null) {
            throw new RuntimeException('Errore aggiornamento strumento.');
        }
        return $entity;
    }

    public function deleteInstrument(int $id, int $userId): void
    {
        $this->instruments->deleteForUser($id, $userId);
    }

    // ─── Prezzi ──────────────────────────────────────────────────────────────

    public function updatePrice(int $userId, int $instrumentId, string $priceDate, float $price, string $source = 'manual'): void
    {
        $instr = $this->instruments->findById($instrumentId, $userId);
        if ($instr === null) {
            throw HttpException::notFound('Strumento non trovato.');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $priceDate)) {
            throw HttpException::badRequest('Data prezzo non valida (YYYY-MM-DD).');
        }
        if ($price <= 0) {
            throw HttpException::badRequest('Prezzo non valido (>0).');
        }
        $this->prices->upsert($instrumentId, $priceDate, number_format($price, 6, '.', ''), $source);
    }

    public function tryFetchAndStoreLatestPrice(int $userId, int $instrumentId): ?float
    {
        $instr = $this->instruments->findById($instrumentId, $userId);
        if ($instr === null) {
            return null;
        }
        $needle = $instr->isin ?? $instr->ticker;
        if ($needle === null || $needle === '') {
            return null;
        }
        $price = $this->quoteFetcher->fetch($needle);
        if ($price === null) {
            return null;
        }
        $this->prices->upsert($instrumentId, date('Y-m-d'), number_format($price, 6, '.', ''), 'external');
        return $price;
    }

    // ─── Operazioni (BUY/SELL/DIVIDEND/FEE/SPLIT) ────────────────────────────

    /**
     * Registra un'operazione titoli in transazione UNICA con la scrittura
     * contabile coerente. Ritorna l'entity arricchita con expense_id/income_id.
     *
     * Campi attesi in $data:
     *   account_id, instrument_id, kind (BUY|SELL|DIVIDEND|FEE|SPLIT),
     *   trade_date, settlement_date?, quantity, price, fee?, tax_withheld?, notes?
     *
     * @param array<string, mixed> $data
     */
    public function recordTransaction(int $userId, array $data): SecurityTransaction
    {
        $row = $this->normalizeTransaction($userId, $data);

        return $this->transactional(function () use ($userId, $row) {
            $expenseId = null;
            $incomeId  = null;

            $category = $this->categories->findOrCreateByName(
                $userId,
                'Investimenti',
                '#6610f2',
                'graph-up-arrow',
            );

            $description = sprintf(
                '%s %s %s @ %s%s',
                $row['kind'],
                rtrim(rtrim(number_format($row['quantity'], 6, '.', ''), '0'), '.'),
                $row['instrument_name'],
                rtrim(rtrim(number_format($row['price'], 6, '.', ''), '0'), '.'),
                $row['fee'] > 0 ? sprintf(' (fee %.2f)', $row['fee']) : '',
            );

            if ($row['kind'] === SecurityTransaction::KIND_BUY || $row['kind'] === SecurityTransaction::KIND_FEE) {
                $expenseId = $this->expenses->create([
                    'user_id'        => $userId,
                    'category_id'    => $category->id,
                    'contact_id'     => null,
                    'account_id'     => $row['account_id'],
                    'amount'         => number_format($row['net_amount'], 2, '.', ''),
                    'description'    => $description . ($row['notes'] !== null ? ' — ' . $row['notes'] : ''),
                    'payment_method' => 'transfer',
                    'expense_date'   => $row['trade_date'],
                    'is_investment'  => 1,
                ]);
            } elseif ($row['kind'] === SecurityTransaction::KIND_SELL || $row['kind'] === SecurityTransaction::KIND_DIVIDEND) {
                $sourceLabel = $row['kind'] === SecurityTransaction::KIND_DIVIDEND
                    ? 'Dividendo'
                    : 'Vendita titolo';
                $incomeId = $this->incomes->create([
                    'user_id'        => $userId,
                    'account_id'     => $row['account_id'],
                    'contact_id'     => null,
                    'source'         => $sourceLabel,
                    'description'    => $description . ($row['notes'] !== null ? ' — ' . $row['notes'] : ''),
                    'amount'         => number_format($row['net_amount'], 2, '.', ''),
                    'payment_method' => 'transfer',
                    'income_date'    => $row['trade_date'],
                ]);
            }
            // SPLIT: nessuna scrittura contabile, solo aggiusta qty (handled in holdings).

            $txId = $this->transactions->create([
                'user_id'         => $userId,
                'account_id'      => $row['account_id'],
                'instrument_id'   => $row['instrument_id'],
                'kind'            => $row['kind'],
                'trade_date'      => $row['trade_date'],
                'settlement_date' => $row['settlement_date'],
                'quantity'        => number_format($row['quantity'],     6, '.', ''),
                'price'           => number_format($row['price'],        6, '.', ''),
                'fee'             => number_format($row['fee'],          2, '.', ''),
                'gross_amount'    => number_format($row['gross_amount'], 2, '.', ''),
                'net_amount'      => number_format($row['net_amount'],   2, '.', ''),
                'tax_withheld'    => number_format($row['tax_withheld'], 2, '.', ''),
                'expense_id'      => $expenseId,
                'income_id'       => $incomeId,
                'notes'           => $row['notes'],
            ]);

            // Aggiorna anche il prezzo di mercato a quel giorno con il prezzo
            // della transazione (utile per le BUY/SELL: e' un dato manuale fresco).
            if ($row['kind'] === SecurityTransaction::KIND_BUY || $row['kind'] === SecurityTransaction::KIND_SELL) {
                if ($row['price'] > 0) {
                    $this->prices->upsert(
                        $row['instrument_id'],
                        $row['trade_date'],
                        number_format($row['price'], 6, '.', ''),
                        'manual',
                    );
                }
            }

            $entity = $this->transactions->findById($txId, $userId);
            if ($entity === null) {
                throw new RuntimeException('Errore nel salvataggio dell\'operazione.');
            }
            return $entity;
        });
    }

    public function deleteTransaction(int $id, int $userId): void
    {
        $existing = $this->transactions->findById($id, $userId);
        if ($existing === null) {
            throw HttpException::notFound('Operazione non trovata.');
        }
        $this->transactional(function () use ($existing, $userId) {
            // Cancella le scritture contabili linkate (se ancora presenti).
            if ($existing->expenseId !== null) {
                $this->expenses->deleteForUser($existing->expenseId, $userId);
            }
            if ($existing->incomeId !== null) {
                $this->incomes->deleteForUser($existing->incomeId, $userId);
            }
            $this->transactions->deleteForUser($existing->id, $userId);
        });
    }

    // ─── Holdings ────────────────────────────────────────────────────────────

    /**
     * @return list<array<string, mixed>>
     */
    public function holdings(int $userId, ?int $accountId = null): array
    {
        return $this->holdingsRepo->forUser($userId, $accountId);
    }

    // ─── Normalize / validate helpers ────────────────────────────────────────

    /**
     * @param  array<string, mixed> $data
     * @return array{name:string, color:string, icon:?string, sort_order:int}
     */
    private function normalizeAssetClass(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 48) {
            throw HttpException::badRequest('Nome classe obbligatorio (max 48).');
        }
        $color = trim((string) ($data['color'] ?? '#6c757d'));
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw HttpException::badRequest('Colore non valido.');
        }
        $icon = $data['icon'] ?? null;
        $icon = $icon === null ? null : trim((string) $icon);
        if ($icon === '') $icon = null;
        if ($icon !== null && mb_strlen($icon) > 32) {
            throw HttpException::badRequest('Nome icona troppo lungo.');
        }
        return [
            'name'       => $name,
            'color'      => strtolower($color),
            'icon'       => $icon,
            'sort_order' => (int) ($data['sort_order'] ?? 100),
        ];
    }

    /**
     * @param  array<string, mixed> $data
     * @return array{account_id:?int, asset_class_id:?int, isin:?string, ticker:?string,
     *               name:string, currency:string, notes:?string, archived:int}
     */
    private function normalizeInstrument(int $userId, array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 128) {
            throw HttpException::badRequest('Nome strumento obbligatorio (max 128).');
        }
        $isin = $data['isin'] ?? null;
        $isin = $isin === null ? null : strtoupper(trim((string) $isin));
        if ($isin === '') $isin = null;
        if ($isin !== null && !preg_match('/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/', $isin)) {
            throw HttpException::badRequest('ISIN non valido (12 caratteri, formato standard).');
        }
        $ticker = $data['ticker'] ?? null;
        $ticker = $ticker === null ? null : strtoupper(trim((string) $ticker));
        if ($ticker === '') $ticker = null;
        if ($ticker !== null && mb_strlen($ticker) > 16) {
            throw HttpException::badRequest('Ticker troppo lungo (max 16).');
        }
        $currency = strtoupper(trim((string) ($data['currency'] ?? 'EUR'))) ?: 'EUR';
        if (!preg_match('/^[A-Z]{3}$/', $currency)) {
            throw HttpException::badRequest('Currency code non valido (ISO 4217, 3 lettere).');
        }

        $accountId = $this->coerceNullableInt($data['account_id'] ?? null);
        if ($accountId !== null) {
            $a = LegacyAccount::findForUser($accountId, $userId);
            if ($a === null) {
                throw HttpException::badRequest('Conto non trovato.');
            }
        }
        $assetClassId = $this->coerceNullableInt($data['asset_class_id'] ?? null);
        if ($assetClassId !== null && $this->assetClasses->findById($assetClassId, $userId) === null) {
            throw HttpException::badRequest('Classe non trovata.');
        }

        $notes = $data['notes'] ?? null;
        $notes = $notes === null ? null : trim((string) $notes);
        if ($notes === '') $notes = null;

        return [
            'account_id'     => $accountId,
            'asset_class_id' => $assetClassId,
            'isin'           => $isin,
            'ticker'         => $ticker,
            'name'           => $name,
            'currency'       => $currency,
            'notes'          => $notes,
            'archived'       => isset($data['archived']) ? (int) (bool) $data['archived'] : 0,
        ];
    }

    /**
     * @param  array<string, mixed> $data
     * @return array{ account_id:int, instrument_id:int, instrument_name:string,
     *                kind:string, trade_date:string, settlement_date:?string,
     *                quantity:float, price:float, fee:float, tax_withheld:float,
     *                gross_amount:float, net_amount:float, notes:?string }
     */
    private function normalizeTransaction(int $userId, array $data): array
    {
        $accountId    = (int) ($data['account_id']    ?? 0);
        $instrumentId = (int) ($data['instrument_id'] ?? 0);
        if ($accountId <= 0 || $instrumentId <= 0) {
            throw HttpException::badRequest('Conto e strumento sono obbligatori.');
        }
        $account = LegacyAccount::findForUser($accountId, $userId);
        if ($account === null) {
            throw HttpException::badRequest('Conto non trovato.');
        }
        $instrument = $this->instruments->findById($instrumentId, $userId);
        if ($instrument === null) {
            throw HttpException::badRequest('Strumento non trovato.');
        }

        $kind = strtoupper((string) ($data['kind'] ?? ''));
        if (!in_array($kind, SecurityTransaction::KINDS, true)) {
            throw HttpException::badRequest('Tipo operazione non valido.');
        }

        $tradeDate = (string) ($data['trade_date'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tradeDate)) {
            throw HttpException::badRequest('Data operazione non valida (YYYY-MM-DD).');
        }
        $settlement = $data['settlement_date'] ?? null;
        $settlement = $settlement === null ? null : trim((string) $settlement);
        if ($settlement === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $settlement ?? '')) {
            $settlement = null;
        }

        $qty   = (float) str_replace(',', '.', (string) ($data['quantity'] ?? 0));
        $price = (float) str_replace(',', '.', (string) ($data['price']    ?? 0));
        $fee   = (float) str_replace(',', '.', (string) ($data['fee']      ?? 0));
        $tax   = (float) str_replace(',', '.', (string) ($data['tax_withheld'] ?? 0));

        if ($kind !== SecurityTransaction::KIND_DIVIDEND && $kind !== SecurityTransaction::KIND_FEE) {
            if ($qty <= 0) {
                throw HttpException::badRequest('Quantita\' deve essere > 0.');
            }
        }
        if ($kind === SecurityTransaction::KIND_DIVIDEND && $price <= 0) {
            throw HttpException::badRequest('Per il dividendo specifica l\'importo nel campo "Importo lordo".');
        }
        if ($kind === SecurityTransaction::KIND_FEE && ($fee <= 0 && $price <= 0)) {
            throw HttpException::badRequest('Importo commissione obbligatorio.');
        }

        $gross = match ($kind) {
            SecurityTransaction::KIND_BUY,
            SecurityTransaction::KIND_SELL  => $qty * $price,
            SecurityTransaction::KIND_DIVIDEND => $price,    // utente passa lordo nel campo price
            SecurityTransaction::KIND_FEE      => max($price, $fee),
            SecurityTransaction::KIND_SPLIT    => 0.0,
            default                           => 0.0,
        };

        $net = match ($kind) {
            SecurityTransaction::KIND_BUY      => $gross + $fee,         // esborso totale
            SecurityTransaction::KIND_SELL     => $gross - $fee - $tax,  // accredito netto
            SecurityTransaction::KIND_DIVIDEND => $gross - $tax - $fee,  // dividendo netto
            SecurityTransaction::KIND_FEE      => $gross,                // solo commissione
            SecurityTransaction::KIND_SPLIT    => 0.0,
            default                            => 0.0,
        };

        $notes = $data['notes'] ?? null;
        $notes = $notes === null ? null : trim((string) $notes);
        if ($notes === '') $notes = null;

        return [
            'account_id'      => $accountId,
            'instrument_id'   => $instrumentId,
            'instrument_name' => $instrument->name,
            'kind'            => $kind,
            'trade_date'      => $tradeDate,
            'settlement_date' => $settlement,
            'quantity'        => $qty,
            'price'           => $price,
            'fee'             => $fee,
            'tax_withheld'    => $tax,
            'gross_amount'    => round($gross, 2),
            'net_amount'      => round($net,   2),
            'notes'           => $notes,
        ];
    }

    private function coerceNullableInt(mixed $raw): ?int
    {
        if ($raw === null || $raw === '' || $raw === '0' || $raw === 0) return null;
        return (int) $raw;
    }
}
