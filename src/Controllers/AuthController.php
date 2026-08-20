<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Http\Request;
use App\Http\Response;
use App\Session;
use InvalidArgumentException;
use Throwable;

/**
 * Auth + setup wizard. Sostituisce setup.php/login.php/logout.php.
 */
final class AuthController extends BaseController
{
    /** GET /setup -- pagina registrazione one-time. */
    public function showSetup(Request $request): Response
    {
        if (Auth::userCount() > 0) {
            return $this->redirect('/login');
        }
        $old = Session::get('_old', []);
        Session::forget('_old');
        return $this->view('auth.setup', [
            'title'    => 'Configurazione iniziale',
            'username' => is_array($old) ? (string) ($old['username'] ?? '') : '',
        ]);
    }

    /** POST /setup -- registrazione. */
    public function setup(Request $request): Response
    {
        if (!Csrf::check($request->csrfToken())) {
            Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
            return $this->redirect('/setup');
        }
        if (Auth::userCount() > 0) {
            return $this->redirect('/login');
        }
        $username = trim((string) ($request->input('username') ?? ''));
        $password = (string) ($request->input('password') ?? '');
        $confirm  = (string) ($request->input('password_confirm') ?? '');

        if ($password !== $confirm) {
            Session::flash('error', 'Le password non coincidono.');
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/setup');
        }
        try {
            Auth::register($username, $password);
        } catch (InvalidArgumentException $e) {
            Session::flash('error', $e->getMessage());
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/setup');
        } catch (Throwable $e) {
            Session::flash('error', 'Registrazione fallita: ' . $e->getMessage());
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/setup');
        }
        Session::flash('success', 'Account creato. Ora puoi effettuare il login.');
        return $this->redirect('/login');
    }

    /** GET /login */
    public function showLogin(Request $request): Response
    {
        if (Auth::check()) {
            return $this->redirect('/dashboard');
        }
        $old = Session::get('_old', []);
        Session::forget('_old');
        return $this->view('auth.login', [
            'title'    => 'Login',
            'username' => is_array($old) ? (string) ($old['username'] ?? '') : '',
        ]);
    }

    /** POST /login */
    public function login(Request $request): Response
    {
        if (!Csrf::check($request->csrfToken())) {
            Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
            return $this->redirect('/login');
        }
        $username = trim((string) ($request->input('username') ?? ''));
        $password = (string) ($request->input('password') ?? '');

        if ($username === '' || $password === '') {
            Session::flash('error', 'Username e password sono obbligatori.');
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/login');
        }
        try {
            $ok = Auth::attempt($username, $password);
        } catch (Throwable $e) {
            Session::flash('error', 'Errore durante il login: ' . $e->getMessage());
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/login');
        }
        if (!$ok) {
            Session::flash('error', 'Credenziali non valide.');
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/login');
        }
        return $this->redirect('/dashboard');
    }

    /** POST /logout */
    public function logout(Request $request): Response
    {
        if (Csrf::check($request->csrfToken())) {
            Auth::logout();
        }
        return $this->redirect('/login');
    }

    // ── Password reset ──────────────────────────────────────────────────────
    //
    // Flusso file-based: /password/forgot accetta lo username e genera il
    // token; /password/reset accetta token + nuova password. Il token in
    // chiaro viene scritto su logs/password-reset.txt — solo chi ha accesso
    // al filesystem locale puo' leggerlo (= il proprietario della macchina).

    /** GET /password/forgot */
    public function showForgot(Request $request): Response
    {
        if (Auth::check()) {
            return $this->redirect('/dashboard');
        }
        $old = Session::get('_old', []);
        Session::forget('_old');
        return $this->view('auth.forgot', [
            'title'         => 'Password dimenticata',
            'username'      => is_array($old) ? (string) ($old['username'] ?? '') : '',
            'tokenFilePath' => Auth::resetTokenFilePath(),
        ]);
    }

    /** POST /password/forgot — genera token e scrive logs/password-reset.txt */
    public function forgot(Request $request): Response
    {
        if (!Csrf::check($request->csrfToken())) {
            Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
            return $this->redirect('/password/forgot');
        }
        $username = trim((string) ($request->input('username') ?? ''));
        if ($username === '') {
            Session::flash('error', 'Username obbligatorio.');
            return $this->redirect('/password/forgot');
        }
        try {
            Auth::createPasswordReset($username);
        } catch (Throwable $e) {
            Session::flash('error', 'Errore durante la generazione del codice: ' . $e->getMessage());
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/password/forgot');
        }
        // Stesso messaggio sia che lo username esista o no, per non rivelarne l'esistenza.
        Session::set('_old', ['username' => $username]);
        Session::flash('success',
            'Se l\'utente esiste, un codice di recupero e\' stato scritto su disco. ' .
            'Aprilo nel file indicato qui sotto e incollalo nel form.'
        );
        return $this->redirect('/password/reset');
    }

    /** GET /password/reset — form per token + nuova password */
    public function showReset(Request $request): Response
    {
        if (Auth::check()) {
            return $this->redirect('/dashboard');
        }
        $old = Session::get('_old', []);
        Session::forget('_old');
        return $this->view('auth.reset', [
            'title'         => 'Reimposta password',
            'username'      => is_array($old) ? (string) ($old['username'] ?? '') : '',
            'tokenFilePath' => Auth::resetTokenFilePath(),
        ]);
    }

    /** POST /password/reset — valida token + applica nuova password */
    public function reset(Request $request): Response
    {
        if (!Csrf::check($request->csrfToken())) {
            Session::flash('error', 'Token CSRF non valido. Ricarica la pagina e riprova.');
            return $this->redirect('/password/reset');
        }
        $username = trim((string) ($request->input('username') ?? ''));
        $token    = trim((string) ($request->input('token') ?? ''));
        $password = (string) ($request->input('password') ?? '');
        $confirm  = (string) ($request->input('password_confirm') ?? '');

        if ($username === '' || $token === '' || $password === '') {
            Session::flash('error', 'Tutti i campi sono obbligatori.');
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/password/reset');
        }
        if ($password !== $confirm) {
            Session::flash('error', 'Le password non coincidono.');
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/password/reset');
        }
        try {
            $ok = Auth::consumePasswordReset($username, $token, $password);
        } catch (InvalidArgumentException $e) {
            Session::flash('error', $e->getMessage());
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/password/reset');
        } catch (Throwable $e) {
            Session::flash('error', 'Errore durante il reset: ' . $e->getMessage());
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/password/reset');
        }
        if (!$ok) {
            Session::flash('error', 'Codice non valido o scaduto. Richiedine uno nuovo.');
            Session::set('_old', ['username' => $username]);
            return $this->redirect('/password/reset');
        }
        Session::flash('success', 'Password aggiornata. Ora puoi accedere con la nuova password.');
        return $this->redirect('/login');
    }
}
