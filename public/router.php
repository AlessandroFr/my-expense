<?php
declare(strict_types=1);

/**
 * Router per il web server integrato di PHP (`php -S ... public/router.php`).
 *
 * Sostituisce le RewriteRule dei due .htaccess: i file realmente presenti sotto
 * public/ li serve il server (`return false`), tutto il resto va al front
 * controller. Fuori da public/ non c'e' nulla di raggiungibile, quindi uploads/,
 * config/, logs/ e src/ non sono piu' esposti come lo erano con il DocumentRoot
 * puntato alla root del progetto.
 */

$path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$path = urldecode(is_string($path) ? $path : '/');

// realpath + prefisso: senza questo un path con ".." potrebbe far risolvere
// is_file() su un file fuori da public/.
$file = realpath(__DIR__ . $path);
if ($file !== false && is_file($file) && str_starts_with($file, __DIR__ . DIRECTORY_SEPARATOR)) {
    return false;
}

require __DIR__ . '/index.php';
