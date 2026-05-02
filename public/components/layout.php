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
</head>
<body class="bg-body-tertiary">

<?php if (Auth::check()): ?>
<nav class="navbar navbar-expand bg-white border-bottom shadow-sm">
    <div class="container">
        <a class="navbar-brand fw-semibold" href="<?= htmlspecialchars($base . '/dashboard', ENT_QUOTES, 'UTF-8') ?>">
            <i class="bi bi-wallet2 me-1"></i><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?>
        </a>
        <div class="ms-auto d-flex align-items-center gap-2">
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
</body>
</html>
