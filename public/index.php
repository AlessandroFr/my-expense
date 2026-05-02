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
        renderPage('dashboard');
        break;

    default:
        http_response_code(404);
        renderPage('404');
        break;
}

/**
 * Rende una pagina avvolta nel layout.
 * Il layout legge $contentFile e $title.
 */
function renderPage(string $page): void
{
    $root        = dirname(__DIR__);
    $pageFile    = $root . '/public/pages/' . $page . '.php';
    $layoutFile  = $root . '/public/components/layout.php';
    $contentFile = is_file($pageFile) ? $pageFile : null;
    $title       = match ($page) {
        'setup'     => 'Configurazione iniziale',
        'login'     => 'Login',
        'dashboard' => 'Dashboard',
        default     => 'Pagina non trovata',
    };
    require $layoutFile;
}
