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

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

    <!-- PWA -->
    <link rel="manifest" href="<?= htmlspecialchars($base . '/manifest.webmanifest', ENT_QUOTES, 'UTF-8') ?>">
    <meta name="theme-color" content="#0d6efd">
    <link rel="apple-touch-icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='28' fill='%230d6efd'/><text x='50%25' y='52%25' font-family='system-ui' font-size='110' font-weight='bold' fill='white' text-anchor='middle' dominant-baseline='middle'>%E2%82%AC</text></svg>">
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
<body class="bg-body-tertiary" data-base-url="<?= htmlspecialchars($base, ENT_QUOTES, 'UTF-8') ?>">

<?php if (Auth::check()): ?>
<nav class="navbar navbar-expand bg-white border-bottom shadow-sm">
    <div class="container">
        <a class="navbar-brand fw-semibold" href="<?= htmlspecialchars($base . '/dashboard', ENT_QUOTES, 'UTF-8') ?>">
            <i class="bi bi-wallet2 me-1"></i><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?>
        </a>
        <ul class="navbar-nav flex-row gap-3 ms-3">
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/dashboard', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-speedometer2 me-1"></i>Dashboard
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/expenses', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-receipt me-1"></i>Spese
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/incomes', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-cash-stack me-1"></i>Entrate
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/categories', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-tags me-1"></i>Categorie
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/budgets', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-bullseye me-1"></i>Budget
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/recurring', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-arrow-repeat me-1"></i>Ricorrenti
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/reports', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-bar-chart-steps me-1"></i>Report
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="<?= htmlspecialchars($base . '/accounts', ENT_QUOTES, 'UTF-8') ?>">
                    <i class="bi bi-bank me-1"></i>Conti
                </a>
            </li>
        </ul>
        <div class="ms-auto d-flex align-items-center gap-2">
            <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" title="Tema">
                    <i id="theme-toggle-icon" class="bi bi-circle-half"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item small" href="#" data-theme-mode="light"><i class="bi bi-sun-fill me-1"></i>Chiaro</a></li>
                    <li><a class="dropdown-item small" href="#" data-theme-mode="dark"><i class="bi bi-moon-stars-fill me-1"></i>Scuro</a></li>
                    <li><a class="dropdown-item small" href="#" data-theme-mode="auto"><i class="bi bi-circle-half me-1"></i>Auto (sistema)</a></li>
                </ul>
            </div>
            <a class="btn btn-sm btn-outline-secondary" href="<?= htmlspecialchars($base . '/backup/download', ENT_QUOTES, 'UTF-8') ?>" title="Backup completo (ZIP)">
                <i class="bi bi-cloud-download"></i>
            </a>
            <span class="text-muted small">
                <i class="bi bi-person-circle me-1"></i>
                <?= htmlspecialchars(Auth::username() ?? '', ENT_QUOTES, 'UTF-8') ?>
            </span>
            <form method="post" action="<?= htmlspecialchars($base . '/logout', ENT_QUOTES, 'UTF-8') ?>" class="m-0">
                <?= Csrf::field() ?>
                <button type="submit" class="btn btn-sm btn-outline-secondary">
                    <i class="bi bi-box-arrow-right"></i> Logout
                </button>
            </form>
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
<script type="module" src="<?= htmlspecialchars($base . '/js/theme.js', ENT_QUOTES, 'UTF-8') ?>"></script>
</body>
</html>
