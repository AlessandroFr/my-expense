<?php
declare(strict_types=1);

/**
 * POST /login — autenticazione utente.
 * Incluso da public/index.php nel case 'POST /login'.
 */

use App\Auth;
use App\Config;
use App\Csrf;
use App\Session;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');

if (!Csrf::check()) {
    Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
    header('Location: ' . $base . '/login');
    exit;
}

$username = trim((string) ($_POST['username'] ?? ''));
$password = (string) ($_POST['password'] ?? '');

if ($username === '' || $password === '') {
    Session::flash('error', 'Username e password sono obbligatori.');
    Session::set('_old', ['username' => $username]);
    header('Location: ' . $base . '/login');
    exit;
}

try {
    $ok = Auth::attempt($username, $password);
} catch (Throwable $e) {
    Session::flash('error', 'Errore durante il login: ' . $e->getMessage());
    Session::set('_old', ['username' => $username]);
    header('Location: ' . $base . '/login');
    exit;
}

if (!$ok) {
    Session::flash('error', 'Credenziali non valide.');
    Session::set('_old', ['username' => $username]);
    header('Location: ' . $base . '/login');
    exit;
}

header('Location: ' . $base . '/dashboard');
exit;
