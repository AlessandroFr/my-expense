<?php
declare(strict_types=1);

namespace App\Services\QuoteFetcher;

/**
 * Stub no-op: le quotazioni sono inserite a mano dall'utente via
 * `/securities/prices/update`. Mantiene il contract attivo cosi' che il
 * SecuritiesService possa gia' chiamare il fetcher; il valore null indica
 * "nessuna quotazione automatica disponibile, fallback al manuale".
 */
final class ManualQuoteFetcher implements QuoteFetcherInterface
{
    public function fetch(string $isinOrTicker): ?float
    {
        return null;
    }
}
