<?php
declare(strict_types=1);

/**
 * Front controller. Ogni request HTTP entra qui (vedi public/.htaccess).
 *
 * Delega tutto a App\Http\Kernel: bootstrap (config + sessione + CSRF),
 * dispatch via Router (definito in routes/web.php + routes/api.php),
 * esecuzione middleware chain, send Response.
 */

require_once dirname(__DIR__) . '/vendor/autoload.php';

use App\Http\Kernel;

$kernel = new Kernel(dirname(__DIR__));
$kernel->handle()->send();
