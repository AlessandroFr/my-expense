<?php
declare(strict_types=1);

/**
 * POST /setup — registrazione one-time del singolo utente.
 * Incluso da public/index.php nel case 'POST /setup'.
 */

use App\Auth;
use App\Config;
use App\Csrf;
use App\Session;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');

if (!Csrf::check()) {
    Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
    header('Location: ' . $base . '/setup');
    exit;
}

if (Auth::userCount() > 0) {
    header('Location: ' . $base . '/login');
    exit;
}

$username = trim((string) ($_POST['username'] ?? ''));
$password = (string) ($_POST['password'] ?? '');
$confirm  = (string) ($_POST['password_confirm'] ?? '');

if ($password !== $confirm) {
    Session::flash('error', 'Le password non coincidono.');
    Session::set('_old', ['username' => $username]);
    header('Location: ' . $base . '/setup');
    exit;
}

try {
    Auth::register($username, $password);
} catch (InvalidArgumentException $e) {
    Session::flash('error', $e->getMessage());
    Session::set('_old', ['username' => $username]);
    header('Location: ' . $base . '/setup');
    exit;
} catch (Throwable $e) {
    Session::flash('error', 'Registrazione fallita: ' . $e->getMessage());
    Session::set('_old', ['username' => $username]);
    header('Location: ' . $base . '/setup');
    exit;
}

Session::flash('success', 'Account creato. Ora puoi effettuare il login.');
header('Location: ' . $base . '/login');
exit;
