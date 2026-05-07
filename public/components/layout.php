<?php
/**
 * Layout HTML principale.
 * Variabili in scope (impostate da public/index.php::renderPage()):
 *   - string|null $contentFile  Path al file della pagina, o null per 404.
 *   - string      $title        Titolo della pagina.
 */

use App\Auth;
use App\Config;
use App\Csrf;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
$appName = Config::get('app')['name'] ?? 'My Expense';
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title . ' — ' . $appName, ENT_QUOTES, 'UTF-8') ?></title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="<?= $asset('css/pastel.css') ?>">
    <link rel="stylesheet" href="<?= $asset('css/transitions.css') ?>">

    <!-- PWA -->
    <link rel="manifest" href="<?= htmlspecialchars($base . '/manifest.webmanifest', ENT_QUOTES, 'UTF-8') ?>">
    <meta name="theme-color" content="#9B7CD9">
    <link rel="apple-touch-icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%239B7CD9'/><stop offset='1' stop-color='%23FF9D6E'/></linearGradient></defs><rect width='192' height='192' rx='40' fill='url(%23g)'/><text x='50%25' y='52%25' font-family='system-ui' font-size='110' font-weight='bold' fill='white' text-anchor='middle' dominant-baseline='middle'>%E2%82%AC</text></svg>">
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('<?= htmlspecialchars($base . '/sw.js', ENT_QUOTES, 'UTF-8') ?>').catch(function(){});
            });
        }
    </script>

    <!-- Tema: applicato in head per evitare FOUC -->
    <script>
        (function() {
            try {
                var m = localStorage.getItem('mx-theme') || 'auto';
                var r = (m === 'auto')
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : (m === 'dark' ? 'dark' : 'light');
                document.documentElement.setAttribute('data-bs-theme', r);
            } catch (e) {}
        })();
    </script>
</head>
<body data-base-url="<?= htmlspecialchars($base, ENT_QUOTES, 'UTF-8') ?>">

<?php if (Auth::check()):
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH) ?: '/';
    if ($base !== '' && strpos($path, $base) === 0) {
        $path = substr($path, strlen($base)) ?: '/';
    }
    $currentPath = '/' . ltrim($path, '/');
    $navMatches = static function (string $current, array $prefixes): bool {
        foreach ($prefixes as $p) {
            if ($current === $p || strpos($current, rtrim($p, '/') . '/') === 0) {
                return true;
            }
        }
        return false;
    };
    $isDashboard = $navMatches($currentPath, ['/dashboard']);
    $isMovements = $navMatches($currentPath, ['/expenses', '/incomes', '/recurring']);
    $isPlan      = $navMatches($currentPath, ['/categories', '/budgets', '/accounts', '/contacts']);
    $isReports   = $navMatches($currentPath, ['/reports']);

    $username = Auth::username() ?? '';
    $avatarInitial = $username !== '' ? mb_strtoupper(mb_substr($username, 0, 1, 'UTF-8'), 'UTF-8') : '?';
?>
<nav class="navbar navbar-expand bg-white border-bottom shadow-sm">
    <div class="container">
        <a class="navbar-brand fw-semibold" href="<?= htmlspecialchars($base . '/dashboard', ENT_QUOTES, 'UTF-8') ?>">
            <i class="bi bi-wallet2 me-1"></i><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?>
        </a>
        <ul class="navbar-nav flex-row gap-1 ms-3">
            <li class="nav-item">
                <a class="nav-link<?= $isDashboard ? ' active' : '' ?>" href="<?= htmlspecialchars($base . '/dashboard', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-speedometer2 me-1"></i>Dashboard
                </a>
            </li>
            <li class="nav-item dropdown<?= $isMovements ? ' active' : '' ?>">
                <a class="nav-link dropdown-toggle<?= $isMovements ? ' active' : '' ?>" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-arrow-left-right me-1"></i>Movimenti
                </a>
                <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/expenses', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-receipt me-2"></i>Spese</a></li>
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/incomes', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-cash-stack me-2"></i>Entrate</a></li>
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/recurring', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-arrow-repeat me-2"></i>Ricorrenti</a></li>
                </ul>
            </li>
            <li class="nav-item dropdown<?= $isPlan ? ' active' : '' ?>">
                <a class="nav-link dropdown-toggle<?= $isPlan ? ' active' : '' ?>" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-sliders2 me-1"></i>Pianifica
                </a>
                <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/categories', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-tags me-2"></i>Categorie</a></li>
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/budgets', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-bullseye me-2"></i>Budget</a></li>
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/accounts', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-bank me-2"></i>Conti</a></li>
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/contacts', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-person-rolodex me-2"></i>Anagrafiche</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a class="nav-link<?= $isReports ? ' active' : '' ?>" href="<?= htmlspecialchars($base . '/reports', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-bar-chart-steps me-1"></i>Report
                </a>
            </li>
        </ul>
        <div class="ms-auto">
            <div class="dropdown">
                <button type="button" class="mx-user-trigger" data-bs-toggle="dropdown" aria-expanded="false" title="Account">
                    <span class="mx-avatar"><?= htmlspecialchars($avatarInitial, ENT_QUOTES, 'UTF-8') ?></span>
                    <span class="mx-user-name d-none d-md-inline"><?= htmlspecialchars($username, ENT_QUOTES, 'UTF-8') ?></span>
                    <i class="bi bi-chevron-down mx-user-caret"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end mx-user-menu">
                    <li class="mx-user-header">
                        <div class="mx-user-header-label">Loggato come</div>
                        <div class="mx-user-header-name text-truncate"><?= htmlspecialchars($username, ENT_QUOTES, 'UTF-8') ?></div>
                    </li>
                    <li><hr class="dropdown-divider"></li>
                    <li class="mx-theme-row">
                        <span class="mx-theme-label">Tema</span>
                        <div class="mx-theme-segments" role="group" aria-label="Tema">
                            <button type="button" class="mx-theme-btn" data-theme-mode="light" title="Chiaro" aria-label="Tema chiaro"><i class="bi bi-sun-fill"></i></button>
                            <button type="button" class="mx-theme-btn" data-theme-mode="dark" title="Scuro" aria-label="Tema scuro"><i class="bi bi-moon-stars-fill"></i></button>
                            <button type="button" class="mx-theme-btn" data-theme-mode="auto" title="Auto" aria-label="Tema automatico"><i class="bi bi-circle-half"></i></button>
                        </div>
                    </li>
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/backup/download', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-cloud-download me-2"></i>Backup ZIP</a></li>
                    <li><a class="dropdown-item" href="<?= htmlspecialchars($base . '/settings', ENT_QUOTES, 'UTF-8') ?>"><i class="bi bi-gear me-2"></i>Impostazioni</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li>
                        <form method="post" action="<?= htmlspecialchars($base . '/logout', ENT_QUOTES, 'UTF-8') ?>" class="m-0">
                            <?= Csrf::field() ?>
                            <button type="submit" class="dropdown-item mx-logout-item"><i class="bi bi-box-arrow-right me-2"></i>Esci</button>
                        </form>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</nav>
<?php endif; ?>

<main class="container py-4">
    <?php require __DIR__ . '/flash.php'; ?>
    <?php
    if ($contentFile !== null) {
        require $contentFile;
    } else {
        echo '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Pagina non trovata.</div>';
    }
    ?>
</main>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/tinymce@7.6.0/tinymce.min.js" referrerpolicy="origin"></script>
<script type="module" src="<?= $asset('js/theme.js') ?>"></script>
<script type="module" src="<?= $asset('js/icon-picker.js') ?>"></script>
<script type="module" src="<?= $asset('js/rich-editor.js') ?>"></script>
</body>
</html>
