<?php
declare(strict_types=1);

/**
 * Front controller — ogni request HTTP entra qui (vedi public/.htaccess).
 * Routing manuale, pochi endpoint, niente framework.
 */

require_once dirname(__DIR__) . '/vendor/autoload.php';

use App\Auth;
use App\Config;
use App\Csrf;
use App\Session;

// ── Bootstrap ──────────────────────────────────────────────────────────────
$root = dirname(__DIR__);
Config::load($root . '/config/config.php');
Session::start();
Csrf::token();

$base   = rtrim(Config::get('app')['base_url'] ?? '', '/');
$debug  = (bool) (Config::get('app')['debug'] ?? false);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path   = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
if ($base !== '' && str_starts_with($path, $base)) {
    $path = substr($path, strlen($base));
}
$path = '/' . trim($path, '/');

// ── Setup gate (DB vuoto → /setup forzato; con utenti → /setup vietato) ───
try {
    $needsSetup = Auth::userCount() === 0;
} catch (\Throwable $e) {
    http_response_code(500);
    echo '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>DB non inizializzato</title></head><body>';
    echo '<h1>Database non inizializzato</h1>';
    echo '<p>Importa <code>database/schema.sql</code> in MySQL prima di usare l\'app.</p>';
    echo '<pre>mysql -u root my_expense &lt; database/schema.sql</pre>';
    if ($debug) {
        echo '<hr><pre>' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') . '</pre>';
    }
    echo '</body></html>';
    exit;
}
if ($needsSetup && $path !== '/setup') {
    header('Location: ' . $base . '/setup');
    exit;
}
if (!$needsSetup && $path === '/setup') {
    header('Location: ' . $base . '/login');
    exit;
}

// ── Routing ────────────────────────────────────────────────────────────────
$route = $method . ' ' . $path;

switch ($route) {
    case 'GET /setup':
        renderPage('setup');
        break;
    case 'POST /setup':
        require __DIR__ . '/endpoints/setup.php';
        break;

    case 'GET /login':
        if (Auth::check()) {
            header('Location: ' . $base . '/dashboard');
            exit;
        }
        renderPage('login');
        break;
    case 'POST /login':
        require __DIR__ . '/endpoints/login.php';
        break;
    case 'POST /logout':
        require __DIR__ . '/endpoints/logout.php';
        break;

    case 'GET /':
    case 'GET /dashboard':
        Auth::requireLogin();
        // Auto-genera occorrenze pendenti da spese ricorrenti (best effort).
        try { \App\RecurringExpense::generatePending((int) Auth::userId()); } catch (\Throwable $e) { /* silent */ }
        renderPage('dashboard');
        break;
    case 'GET /dashboard/data':
        require __DIR__ . '/endpoints/dashboard_data.php';
        break;

    // ── Categorie ────────────────────────────────────────────────────────
    case 'GET /categories':
        Auth::requireLogin();
        renderPage('categories');
        break;
    case 'GET /categories/edit':
        Auth::requireLogin();
        renderPage('category_edit', ['id' => (int) ($_GET['id'] ?? 0)]);
        break;
    case 'POST /categories/create':
        require __DIR__ . '/endpoints/categories_create.php';
        break;
    case 'POST /categories/update':
        require __DIR__ . '/endpoints/categories_update.php';
        break;
    case 'POST /categories/delete':
        require __DIR__ . '/endpoints/categories_delete.php';
        break;

    // ── Budget mensili ───────────────────────────────────────────────────
    case 'GET /budgets':
        Auth::requireLogin();
        renderPage('budgets');
        break;
    case 'GET /budgets/list':
        require __DIR__ . '/endpoints/budgets_list.php';
        break;
    case 'POST /budgets/set':
        require __DIR__ . '/endpoints/budgets_set.php';
        break;
    case 'POST /budgets/delete':
        require __DIR__ . '/endpoints/budgets_delete.php';
        break;

    // ── Spese ────────────────────────────────────────────────────────────
    case 'GET /expenses':
        Auth::requireLogin();
        renderPage('expenses');
        break;
    case 'GET /expenses/list':
        require __DIR__ . '/endpoints/expenses_list.php';
        break;
    case 'POST /expenses/create':
        require __DIR__ . '/endpoints/expenses_create.php';
        break;
    case 'POST /expenses/update':
        require __DIR__ . '/endpoints/expenses_update.php';
        break;
    case 'POST /expenses/delete':
        require __DIR__ . '/endpoints/expenses_delete.php';
        break;
    case 'GET /expenses/export':
        require __DIR__ . '/endpoints/expenses_export.php';
        break;
    case 'POST /expenses/import':
        require __DIR__ . '/endpoints/expenses_import.php';
        break;
    case 'POST /import/bank-statement/preview':
        require __DIR__ . '/endpoints/bank_import_preview.php';
        break;
    case 'POST /import/bank-statement/commit':
        require __DIR__ . '/endpoints/bank_import_commit.php';
        break;

    // ── Entrate ──────────────────────────────────────────────────────────
    case 'GET /incomes':
        Auth::requireLogin();
        renderPage('incomes');
        break;
    case 'GET /incomes/list':
        require __DIR__ . '/endpoints/incomes_list.php';
        break;
    case 'POST /incomes/create':
        require __DIR__ . '/endpoints/incomes_create.php';
        break;
    case 'POST /incomes/update':
        require __DIR__ . '/endpoints/incomes_update.php';
        break;
    case 'POST /incomes/delete':
        require __DIR__ . '/endpoints/incomes_delete.php';
        break;

    // ── Spese ricorrenti ─────────────────────────────────────────────────
    case 'GET /recurring':
        Auth::requireLogin();
        renderPage('recurring');
        break;
    case 'GET /recurring/list':
        require __DIR__ . '/endpoints/recurring_list.php';
        break;
    case 'POST /recurring/create':
        require __DIR__ . '/endpoints/recurring_create.php';
        break;
    case 'POST /recurring/update':
        require __DIR__ . '/endpoints/recurring_update.php';
        break;
    case 'POST /recurring/toggle':
        require __DIR__ . '/endpoints/recurring_toggle.php';
        break;
    case 'POST /recurring/delete':
        require __DIR__ . '/endpoints/recurring_delete.php';
        break;
    case 'POST /recurring/run':
        require __DIR__ . '/endpoints/recurring_run.php';
        break;

    // ── Tag ──────────────────────────────────────────────────────────────
    case 'GET /tags/list':
        require __DIR__ . '/endpoints/tags_list.php';
        break;
    case 'POST /tags/assign':
        require __DIR__ . '/endpoints/tags_assign.php';
        break;
    case 'POST /tags/delete':
        require __DIR__ . '/endpoints/tags_delete.php';
        break;

    // ── Report ──────────────────────────────────────────────────────────
    case 'GET /reports':
        Auth::requireLogin();
        renderPage('reports');
        break;
    case 'GET /reports/year':
        require __DIR__ . '/endpoints/reports_year.php';
        break;

    // ── Allegati ─────────────────────────────────────────────────────────
    case 'GET /attachments/list':
        require __DIR__ . '/endpoints/attachments_list.php';
        break;
    case 'POST /attachments/upload':
        require __DIR__ . '/endpoints/attachments_upload.php';
        break;
    case 'POST /attachments/delete':
        require __DIR__ . '/endpoints/attachments_delete.php';
        break;
    case 'GET /attachments/download':
        require __DIR__ . '/endpoints/attachments_download.php';
        break;

    // ── Anagrafiche fornitori/clienti ────────────────────────────────────
    case 'GET /contacts':
        Auth::requireLogin();
        renderPage('contacts');
        break;
    case 'GET /contacts/list':
        require __DIR__ . '/endpoints/contacts_list.php';
        break;
    case 'POST /contacts/create':
        require __DIR__ . '/endpoints/contacts_create.php';
        break;
    case 'POST /contacts/update':
        require __DIR__ . '/endpoints/contacts_update.php';
        break;
    case 'POST /contacts/archive':
        require __DIR__ . '/endpoints/contacts_archive.php';
        break;
    case 'POST /contacts/delete':
        require __DIR__ . '/endpoints/contacts_delete.php';
        break;
    case 'GET /contacts/detail':
        Auth::requireLogin();
        renderPage('contact_detail', ['id' => (int) ($_GET['id'] ?? 0)]);
        break;
    case 'GET /contacts/balance':
        require __DIR__ . '/endpoints/contacts_balance.php';
        break;
    case 'GET /contacts/movements':
        require __DIR__ . '/endpoints/contacts_movements.php';
        break;
    case 'POST /contacts/reassign':
        require __DIR__ . '/endpoints/contacts_reassign.php';
        break;

    // ── Conti (multi-account) ────────────────────────────────────────────
    case 'GET /accounts':
        Auth::requireLogin();
        renderPage('accounts');
        break;
    case 'GET /accounts/list':
        require __DIR__ . '/endpoints/accounts_list.php';
        break;
    case 'POST /accounts/create':
        require __DIR__ . '/endpoints/accounts_create.php';
        break;
    case 'POST /accounts/update':
        require __DIR__ . '/endpoints/accounts_update.php';
        break;
    case 'POST /accounts/delete':
        require __DIR__ . '/endpoints/accounts_delete.php';
        break;
    case 'POST /accounts/reconcile':
        require __DIR__ . '/endpoints/accounts_reconcile.php';
        break;
    case 'GET /accounts/reconciliations':
        require __DIR__ . '/endpoints/accounts_reconciliations_list.php';
        break;
    case 'POST /accounts/reconciliation/delete':
        require __DIR__ . '/endpoints/accounts_reconciliation_delete.php';
        break;

    // ── Saved filters ────────────────────────────────────────────────────
    case 'GET /filters/list':
        require __DIR__ . '/endpoints/filters_list.php';
        break;
    case 'POST /filters/save':
        require __DIR__ . '/endpoints/filters_save.php';
        break;
    case 'POST /filters/delete':
        require __DIR__ . '/endpoints/filters_delete.php';
        break;

    // ── Backup ───────────────────────────────────────────────────────────
    case 'GET /backup/download':
        require __DIR__ . '/endpoints/backup_download.php';
        break;
    case 'POST /backup/restore':
        require __DIR__ . '/endpoints/backup_restore.php';
        break;

    // ── Impostazioni / reset DB ──────────────────────────────────────────
    case 'GET /settings':
        Auth::requireLogin();
        renderPage('settings');
        break;
    case 'POST /db/reset':
        require __DIR__ . '/endpoints/db_reset.php';
        break;

    default:
        http_response_code(404);
        renderPage('404');
        break;
}

/**
 * Rende una pagina avvolta nel layout.
 * Il layout legge $contentFile, $title, e qualsiasi variabile in $data.
 */
function renderPage(string $page, array $data = []): void
{
    $root        = dirname(__DIR__);
    $pageFile    = $root . '/public/pages/' . $page . '.php';
    $layoutFile  = $root . '/public/components/layout.php';
    $contentFile = is_file($pageFile) ? $pageFile : null;
    $title       = match ($page) {
        'setup'         => 'Configurazione iniziale',
        'login'         => 'Login',
        'dashboard'     => 'Dashboard',
        'categories'    => 'Categorie',
        'category_edit' => 'Modifica categoria',
        'expenses'      => 'Spese',
        'incomes'       => 'Entrate',
        'budgets'       => 'Budget mensili',
        'recurring'     => 'Spese ricorrenti',
        'reports'       => 'Report annuale',
        'accounts'      => 'Conti',
        'contacts'      => 'Anagrafiche',
        'contact_detail'=> 'Dettaglio anagrafica',
        'settings'      => 'Impostazioni',
        default         => 'Pagina non trovata',
    };

    // Cache busting per asset statici (JS/CSS) sotto public/.
    // Genera URL con ?v=<filemtime> cosi' ogni modifica del file invalida la cache.
    $assetBase = rtrim(\App\Config::get('app')['base_url'] ?? '', '/');
    $asset = function (string $relPath) use ($assetBase): string {
        $full = dirname(__DIR__) . '/public/' . ltrim($relPath, '/');
        $v    = is_file($full) ? (string) filemtime($full) : '0';
        return htmlspecialchars($assetBase . '/' . ltrim($relPath, '/') . '?v=' . $v, ENT_QUOTES, 'UTF-8');
    };
    if (!isset($data['asset'])) {
        $data['asset'] = $asset;
    }

    extract($data, EXTR_SKIP);
    require $layoutFile;
}
