<?php
declare(strict_types=1);

/**
 * POST /logout — chiusura sessione.
 * Incluso da public/index.php nel case 'POST /logout'.
 */

use App\Auth;
use App\Config;
use App\Csrf;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');

if (Csrf::check()) {
    Auth::logout();
}

header('Location: ' . $base . '/login');
exit;
