<?php
declare(strict_types=1);

namespace App\Services\QuoteFetcher;

/**
 * Contract per provider di quotazioni esterne (Yahoo Finance, FMP,
 * AlphaVantage, ecc.). Restituisce il prezzo corrente in EUR (o nella
 * currency dello strumento) oppure null se il provider non lo conosce.
 *
 * In v1 la sola implementazione e' ManualQuoteFetcher (no-op): le
 * quotazioni vengono inserite a mano in `securities_prices`. Lasciamo
 * comunque l'interface gia' pronta per agganciare un provider HTTP
 * in futuro senza toccare il SecuritiesService.
 */
interface QuoteFetcherInterface
{
    /**
     * @param string $isinOrTicker  ISIN (12 char) o ticker (es. "VWCE", "VOO").
     * @return float|null  Prezzo nella currency dello strumento, o null se non risolto.
     */
    public function fetch(string $isinOrTicker): ?float;
}
