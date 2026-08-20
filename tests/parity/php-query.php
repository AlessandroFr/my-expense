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
    default => throw new InvalidArgumentException("Dominio sconosciuto: {$dominio}"),
};

echo json_encode($risultato, JSON_UNESCAPED_UNICODE);
