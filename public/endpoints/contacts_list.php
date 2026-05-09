<?php
declare(strict_types=1);

use App\Auth;
use App\Contact;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}

$userId = (int) Auth::userId();
$includeArchived = (bool) (int) ($_GET['include_archived'] ?? 0);
$typeRaw = isset($_GET['type']) ? (string) $_GET['type'] : '';
$type    = ($typeRaw === 'supplier' || $typeRaw === 'customer') ? $typeRaw : null;

$search   = trim((string) ($_GET['search'] ?? ''));
$page     = max(1, (int) ($_GET['page'] ?? 1));
// page_size = 0 → no LIMIT (modalità "datalist", carica tutti gli id+name).
$pageSize = (int) ($_GET['page_size'] ?? 25);
if ($pageSize < 0)   $pageSize = 25;
if ($pageSize > 200) $pageSize = 200;

try {
    $opts = ['search' => $search === '' ? null : $search];
    if ($pageSize > 0) {
        $opts['limit']  = $pageSize;
        $opts['offset'] = ($page - 1) * $pageSize;
    }

    $items = Contact::allForUser($userId, $includeArchived, $type, $opts);

    if ($pageSize > 0) {
        $total = Contact::countForUser($userId, $includeArchived, [
            'search' => $search === '' ? null : $search,
        ]);
        $totalPages = (int) max(1, (int) ceil($total / $pageSize));
    } else {
        $total      = count($items);
        $totalPages = 1;
    }

    // Per ogni contatto: usage counts (per la pagina /contacts) — best effort,
    // 1 query per contatto. Saltiamo in modalità datalist (page_size=0) per
    // evitare N+1 su grandi liste.
    if ($pageSize > 0 && !empty($_GET['with_usage']) && (int) $_GET['with_usage'] === 1) {
        foreach ($items as &$c) {
            $c['usage'] = Contact::usageCount((int) $c['id'], $userId);
        }
        unset($c);
    }
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'contacts'    => $items,
    'total'       => $total,
    'page'        => $pageSize > 0 ? $page : 1,
    'page_size'   => $pageSize,
    'total_pages' => $totalPages,
]);
