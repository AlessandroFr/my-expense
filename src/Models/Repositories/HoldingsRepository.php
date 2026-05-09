<?php
declare(strict_types=1);

namespace App\Models\Repositories;

/**
 * Repository "vista derivata": calcola le holdings (qty, prezzo medio carico,
 * mark-to-market, P&L) aggregando `securities_transactions`.
 *
 * Non e' una tabella ma una proiezione SQL. Cosi' cancellazioni e rettifiche
 * sono coerenti senza logica extra.
 *
 * Convenzioni:
 *   qty       = SUM(BUY.qty) - SUM(SELL.qty) + SUM(SPLIT.qty)
 *   buy_cost  = SUM(BUY.gross_amount + BUY.fee)
 *   buy_qty   = SUM(BUY.qty)
 *   avg_cost  = buy_cost / buy_qty   (se buy_qty > 0)
 *   realized  = SUM(SELL.net_amount) - SUM(SELL.qty) * avg_cost
 *   dividends = SUM(DIVIDEND.net_amount)
 *   fees      = SUM(FEE.gross_amount)
 *   mark_value  = qty * last_price          (se last_price disponibile)
 *   unrealized  = mark_value - qty * avg_cost
 *   total_pnl   = realized + unrealized + dividends
 *
 * Approssimazione "average cost" (sufficient per dashboard);
 * FIFO/LIFO sara' un'evoluzione futura.
 */
final class HoldingsRepository extends BaseRepository
{
    /**
     * @return list<array{
     *   instrument_id:int, instrument_name:string, instrument_ticker:?string, instrument_isin:?string,
     *   account_id:int, account_name:string, account_color:?string,
     *   asset_class_id:?int, asset_class_name:?string, asset_class_color:?string,
     *   currency:string, qty:float, avg_cost:float, buy_cost:float,
     *   realized:float, dividends:float, fees:float,
     *   last_price:?float, last_price_date:?string,
     *   mark_value:?float, unrealized:?float, total_pnl:float
     * }>
     */
    public function forUser(int $userId, ?int $accountId = null): array
    {
        $params  = [$userId];
        $where   = 't.user_id = ?';
        if ($accountId !== null && $accountId > 0) {
            $where .= ' AND t.account_id = ?';
            $params[] = $accountId;
        }

        $rows = $this->fetchAll(
            "SELECT s.id   AS instrument_id,
                    s.name AS instrument_name,
                    s.ticker AS instrument_ticker,
                    s.isin   AS instrument_isin,
                    s.currency,
                    s.account_id,
                    a.name  AS account_name,
                    a.color AS account_color,
                    s.asset_class_id,
                    ac.name  AS asset_class_name,
                    ac.color AS asset_class_color,
                    SUM(CASE WHEN t.kind = 'BUY'   THEN t.quantity
                             WHEN t.kind = 'SELL'  THEN -t.quantity
                             WHEN t.kind = 'SPLIT' THEN t.quantity
                             ELSE 0 END)                                            AS qty,
                    SUM(CASE WHEN t.kind = 'BUY'  THEN t.quantity ELSE 0 END)       AS buy_qty,
                    SUM(CASE WHEN t.kind = 'BUY'  THEN t.gross_amount + t.fee ELSE 0 END) AS buy_cost,
                    SUM(CASE WHEN t.kind = 'SELL' THEN t.net_amount ELSE 0 END)     AS sell_proceeds,
                    SUM(CASE WHEN t.kind = 'SELL' THEN t.quantity   ELSE 0 END)     AS sell_qty,
                    SUM(CASE WHEN t.kind = 'DIVIDEND' THEN t.net_amount ELSE 0 END) AS dividends,
                    SUM(CASE WHEN t.kind = 'FEE'      THEN t.gross_amount ELSE 0 END) AS fees,
                    (SELECT p.price      FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price,
                    (SELECT p.price_date FROM securities_prices p WHERE p.instrument_id = s.id ORDER BY p.price_date DESC LIMIT 1) AS last_price_date
             FROM securities_transactions t
             INNER JOIN securities_instruments s ON s.id = t.instrument_id
             INNER JOIN accounts a               ON a.id = t.account_id
             LEFT  JOIN asset_classes ac         ON ac.id = s.asset_class_id
             WHERE {$where}
             GROUP BY s.id, s.name, s.ticker, s.isin, s.currency, s.account_id, a.name, a.color,
                      s.asset_class_id, ac.name, ac.color
             ORDER BY s.name ASC",
            $params,
        );

        $out = [];
        foreach ($rows as $r) {
            $qty       = (float) $r['qty'];
            $buyQty    = (float) $r['buy_qty'];
            $buyCost   = (float) $r['buy_cost'];
            $sellProc  = (float) $r['sell_proceeds'];
            $sellQty   = (float) $r['sell_qty'];
            $dividends = (float) $r['dividends'];
            $fees      = (float) $r['fees'];
            $lastPrice = $r['last_price'] !== null ? (float) $r['last_price'] : null;

            $avgCost   = $buyQty > 0 ? $buyCost / $buyQty : 0.0;
            $realized  = $sellQty > 0 ? ($sellProc - $sellQty * $avgCost) : 0.0;
            $markValue = ($lastPrice !== null) ? $qty * $lastPrice : null;
            $unrealized = $markValue !== null ? ($markValue - $qty * $avgCost) : null;
            $totalPnl   = $realized + $dividends + ($unrealized ?? 0.0);

            $out[] = [
                'instrument_id'      => (int) $r['instrument_id'],
                'instrument_name'    => (string) $r['instrument_name'],
                'instrument_ticker'  => $r['instrument_ticker'] !== null ? (string) $r['instrument_ticker'] : null,
                'instrument_isin'    => $r['instrument_isin']   !== null ? (string) $r['instrument_isin']   : null,
                'account_id'         => (int) $r['account_id'],
                'account_name'       => (string) $r['account_name'],
                'account_color'      => $r['account_color'] !== null ? (string) $r['account_color'] : null,
                'asset_class_id'     => $r['asset_class_id']    !== null ? (int)    $r['asset_class_id']    : null,
                'asset_class_name'   => $r['asset_class_name']  !== null ? (string) $r['asset_class_name']  : null,
                'asset_class_color'  => $r['asset_class_color'] !== null ? (string) $r['asset_class_color'] : null,
                'currency'           => (string) ($r['currency'] ?? 'EUR'),
                'qty'                => round($qty,       6),
                'avg_cost'           => round($avgCost,   6),
                'buy_cost'           => round($buyCost,   2),
                'realized'           => round($realized,  2),
                'dividends'          => round($dividends, 2),
                'fees'               => round($fees,      2),
                'last_price'         => $lastPrice !== null ? round($lastPrice, 6) : null,
                'last_price_date'    => $r['last_price_date'] !== null ? (string) $r['last_price_date'] : null,
                'mark_value'         => $markValue !== null ? round($markValue, 2) : null,
                'unrealized'         => $unrealized !== null ? round($unrealized, 2) : null,
                'total_pnl'          => round($totalPnl, 2),
            ];
        }
        return $out;
    }

    /**
     * Riassunto per asset class: invested = qty * avg_cost,
     * current = SUM(mark_value) (solo se prezzi disponibili).
     *
     * @return list<array{
     *   asset_class_id:?int, asset_class_name:string, asset_class_color:string,
     *   invested:float, current:?float, dividends:float, pnl:float
     * }>
     */
    public function byAssetClass(int $userId): array
    {
        $holdings = $this->forUser($userId);
        $byClass  = [];
        foreach ($holdings as $h) {
            $key = $h['asset_class_id'] ?? 0;
            if (!isset($byClass[$key])) {
                $byClass[$key] = [
                    'asset_class_id'    => $h['asset_class_id'],
                    'asset_class_name'  => $h['asset_class_name']  ?? 'Senza classe',
                    'asset_class_color' => $h['asset_class_color'] ?? '#6c757d',
                    'invested'          => 0.0,
                    'current'           => 0.0,
                    'has_marked'        => false,
                    'dividends'         => 0.0,
                    'pnl'               => 0.0,
                ];
            }
            $byClass[$key]['invested']  += $h['qty'] * $h['avg_cost'];
            if ($h['mark_value'] !== null) {
                $byClass[$key]['current']    += $h['mark_value'];
                $byClass[$key]['has_marked']  = true;
            }
            $byClass[$key]['dividends'] += $h['dividends'];
            $byClass[$key]['pnl']       += $h['total_pnl'];
        }
        return array_values(array_map(static fn(array $r): array => [
            'asset_class_id'    => $r['asset_class_id'],
            'asset_class_name'  => $r['asset_class_name'],
            'asset_class_color' => $r['asset_class_color'],
            'invested'          => round($r['invested'], 2),
            'current'           => $r['has_marked'] ? round($r['current'], 2) : null,
            'dividends'         => round($r['dividends'], 2),
            'pnl'               => round($r['pnl'], 2),
        ], $byClass));
    }
}
