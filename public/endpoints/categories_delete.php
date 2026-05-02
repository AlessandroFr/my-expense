<?php
declare(strict_types=1);

/**
 * POST /categories/delete — elimina una categoria.
 */

use App\Auth;
use App\Category;
use App\Config;
use App\Csrf;
use App\Session;

Auth::requireLogin();

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');

if (!Csrf::check()) {
    Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
    header('Location: ' . $base . '/categories');
    exit;
}

$id = (int) ($_POST['id'] ?? 0);

try {
    Category::delete($id, (int) Auth::userId());
    Session::flash('success', 'Categoria eliminata.');
} catch (Throwable $e) {
    Session::flash('error', 'Eliminazione fallita: ' . $e->getMessage());
}

header('Location: ' . $base . '/categories');
exit;
