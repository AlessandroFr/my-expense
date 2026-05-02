<?php
declare(strict_types=1);

/**
 * POST /categories/update — modifica una categoria esistente.
 */

use App\Auth;
use App\Category;
use App\Config;
use App\Csrf;
use App\Session;

Auth::requireLogin();

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
$id   = (int) ($_POST['id'] ?? 0);

if (!Csrf::check()) {
    Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
    header('Location: ' . $base . '/categories/edit?id=' . $id);
    exit;
}

$name      = (string) ($_POST['name'] ?? '');
$color     = (string) ($_POST['color'] ?? '#6c757d');
$iconRaw   = trim((string) ($_POST['icon'] ?? ''));
$icon      = $iconRaw === '' ? null : $iconRaw;
$sortOrder = (int) ($_POST['sort_order'] ?? 0);

try {
    Category::update($id, (int) Auth::userId(), $name, $color, $icon, $sortOrder);
    Session::flash('success', 'Categoria aggiornata.');
    header('Location: ' . $base . '/categories');
    exit;
} catch (Throwable $e) {
    Session::flash('error', $e->getMessage());
    Session::set('_old', [
        'name'       => $name,
        'color'      => $color,
        'icon'       => $iconRaw,
        'sort_order' => $sortOrder,
    ]);
    header('Location: ' . $base . '/categories/edit?id=' . $id);
    exit;
}
