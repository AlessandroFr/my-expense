<?php
declare(strict_types=1);

/**
 * Esegue una lettura lato PHP e la stampa come JSON, per confrontarla con la
 * stessa lettura fatta da Node. Gira da riga di comando, quindi non passa dal
 * login: si confrontano i dati, non l'autenticazione.
 *
 *   php tests/parity/php-query.php expenses '{"limit":50}'
 */

$root = dirname(__DIR__, 2);
require $root . '/vendor/autoload.php';
App\Config::load($root . '/config/config.php');

$dominio = $argv[1] ?? '';
$filtri  = json_decode($argv[2] ?? '{}', true) ?: [];
$userId  = 1;

$risultato = match ($dominio) {
    'expenses' => (static function () use ($filtri, $userId): array {
        $repo = new App\Models\Repositories\ExpenseRepository();
        return [
            'expenses' => array_map(static fn($e) => $e->toArray(), $repo->list($userId, $filtri)),
            'total'    => $repo->count($userId, $filtri),
        ];
    })(),
    'incomes' => (static function () use ($filtri, $userId): array {
        $repo = new App\Models\Repositories\IncomeRepository();
        return [
            'incomes' => array_map(static fn($i) => $i->toArray(), $repo->list($userId, $filtri)),
            'total'   => $repo->count($userId, $filtri),
            'sources' => $repo->distinctSources($userId),
        ];
    })(),
    'accounts' => ['accounts' => App\Account::withBalances($userId, (bool) ($filtri['include_archived'] ?? false))],
    // /budgets/list restituisce anche l'elenco categorie: e' li' che si
    // confronta la serializzazione delle categorie, non esiste /categories/list.
    'budgets' => [
        'budgets' => array_map(
            static fn($b) => $b->toArray(),
            (new App\Services\BudgetService())->progressForMonth($userId, (string) ($filtri['month'] ?? date('Y-m'))),
        ),
        'categories' => array_map(
            static fn($c) => $c->toArray(),
            (new App\Models\Repositories\CategoryRepository())->listForUser($userId),
        ),
    ],
    'transfers' => (static function () use ($filtri, $userId): array {
        $repo = new App\Models\Repositories\TransferRepository();
        return [
            'transfers' => array_map(static fn($t) => $t->toArray(), $repo->list($userId, $filtri)),
            'total'     => $repo->count($userId, $filtri),
        ];
    })(),
    'contacts' => (static function () use ($filtri, $userId): array {
        $opts = ['search' => $filtri['search'] ?? null];
        if (!empty($filtri['page_size'])) {
            $opts['limit']  = (int) $filtri['page_size'];
            $opts['offset'] = ((int) ($filtri['page'] ?? 1) - 1) * (int) $filtri['page_size'];
        }
        return [
            'contacts' => App\Contact::allForUser($userId, (bool) ($filtri['include_archived'] ?? false), null, $opts),
            'total'    => App\Contact::countForUser($userId, (bool) ($filtri['include_archived'] ?? false), $opts),
        ];
    })(),
    'contacts-balance' => (static function () use ($filtri, $userId): array {
        $from = (string) ($filtri['from'] ?? '2020-01-01');
        $to   = (string) ($filtri['to'] ?? '2030-12-31');
        return ['summary' => App\Contact::balanceSummary($userId, $from, $to, null)];
    })(),
    'contacts-movements' => (static function () use ($filtri, $userId): array {
        $cid = (int) ($filtri['contact_id'] ?? 0);
        return [
            'movements' => App\Contact::movementsForUser($userId, $cid, ['limit' => 50, 'offset' => 0]),
            'counts'    => (static function () use ($cid, $userId): array {
                $u = App\Contact::usageCount($cid, $userId);
                return ['expense' => $u['expenses'], 'income' => $u['incomes'],
                        'recurring' => $u['recurring'], 'total' => $u['total']];
            })(),
        ];
    })(),
    default => throw new InvalidArgumentException("Dominio sconosciuto: {$dominio}"),
};

echo json_encode($risultato, JSON_UNESCAPED_UNICODE);
