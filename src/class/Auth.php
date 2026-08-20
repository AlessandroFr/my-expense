<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use RuntimeException;

final class Auth
{
    public static function userCount(): int
    {
        $count = Database::pdo()->query('SELECT COUNT(*) FROM users')->fetchColumn();
        return (int) $count;
    }

    public static function register(string $username, string $password): int
    {
        $username = trim($username);

        if ($username === '' || mb_strlen($username) > 64) {
            throw new InvalidArgumentException('Username obbligatorio (max 64 caratteri).');
        }
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('La password deve essere di almeno 8 caratteri.');
        }
        if (self::userCount() > 0) {
            throw new RuntimeException('La registrazione è già stata completata.');
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = Database::pdo()->prepare(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)'
        );
        $stmt->execute([$username, $hash]);

        return (int) Database::pdo()->lastInsertId();
    }

    public static function attempt(string $username, string $password): bool
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1'
        );
        $stmt->execute([$username]);
        $row = $stmt->fetch();

        if (!$row || !password_verify($password, $row['password_hash'])) {
            return false;
        }

        Session::regenerate();
        Session::set('user_id', (int) $row['id']);
        Session::set('username', (string) $row['username']);

        Database::pdo()
            ->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')
            ->execute([$row['id']]);

        return true;
    }

    public static function check(): bool
    {
        return Session::get('user_id') !== null;
    }

    /**
     * Verifica la password di un utente già loggato (re-auth per azioni distruttive).
     * Diversamente da attempt(), non rigenera la sessione né aggiorna last_login_at.
     */
    public static function verifyPassword(int $userId, string $password): bool
    {
        if ($password === '') {
            return false;
        }
        $stmt = Database::pdo()->prepare(
            'SELECT password_hash FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) {
            return false;
        }
        return password_verify($password, (string) $row['password_hash']);
    }

    public static function userId(): ?int
    {
        $id = Session::get('user_id');
        return $id === null ? null : (int) $id;
    }

    public static function username(): ?string
    {
        $u = Session::get('username');
        return $u === null ? null : (string) $u;
    }

    public static function logout(): void
    {
        Session::destroy();
    }

    public static function requireLogin(): void
    {
        if (self::check()) {
            return;
        }
        $base = Config::get('app')['base_url'] ?? '';
        header('Location: ' . $base . '/login');
        exit;
    }

    // ── Password reset (file-based recovery) ────────────────────────────────
    //
    // App locale single-user senza SMTP: la prova d'identita' e' l'accesso al
    // filesystem della macchina dove gira XAMPP. Il flusso:
    //   1) createPasswordReset() genera un token random, salva l'hash + scadenza
    //      sulla riga users e scrive il token IN CHIARO su logs/password-reset.txt
    //   2) L'utente apre quel file, copia il codice, lo incolla su /password/reset
    //   3) consumePasswordReset() valida il token, aggiorna password_hash,
    //      azzera reset_token_hash e cancella il file su disco
    //
    // Validita' token: 15 minuti. Uso singolo (sovrascrittura su nuovo /forgot).

    private const RESET_TTL_MINUTES = 15;

    /** Path assoluto del file che contiene il token in chiaro. */
    public static function resetTokenFilePath(): string
    {
        $root = dirname(__DIR__, 2); // src/class/Auth.php -> project root
        return $root . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'password-reset.txt';
    }

    /**
     * Genera un token di reset per lo username dato, salva l'hash su DB e
     * scrive il token in chiaro su disco. Ritorna il token oppure null se lo
     * username non esiste. Il chiamante deve mostrare lo stesso messaggio in
     * entrambi i casi per non rivelare l'esistenza di un account.
     */
    public static function createPasswordReset(string $username): ?string
    {
        $username = trim($username);
        if ($username === '') {
            return null;
        }
        $stmt = Database::pdo()->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        $userId = (int) $row['id'];

        $token = bin2hex(random_bytes(16)); // 32 char hex
        $hash  = hash('sha256', $token);
        $exp   = (new \DateTimeImmutable('+' . self::RESET_TTL_MINUTES . ' minutes'))->format('Y-m-d H:i:s');

        Database::pdo()
            ->prepare('UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?')
            ->execute([$hash, $exp, $userId]);

        self::writeResetTokenFile($username, $token, $exp);

        return $token;
    }

    /** Valida il token e applica la nuova password. Ritorna true al successo. */
    public static function consumePasswordReset(string $username, string $token, string $newPassword): bool
    {
        $username = trim($username);
        $token    = trim($token);
        if ($username === '' || $token === '') {
            return false;
        }
        if (strlen($newPassword) < 8) {
            throw new InvalidArgumentException('La nuova password deve essere di almeno 8 caratteri.');
        }
        $stmt = Database::pdo()->prepare(
            'SELECT id, reset_token_hash, reset_token_expires_at
               FROM users WHERE username = ? LIMIT 1'
        );
        $stmt->execute([$username]);
        $row = $stmt->fetch();
        if (!$row || empty($row['reset_token_hash']) || empty($row['reset_token_expires_at'])) {
            return false;
        }
        $candidate = hash('sha256', $token);
        if (!hash_equals((string) $row['reset_token_hash'], $candidate)) {
            return false;
        }
        $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        if ($now > (string) $row['reset_token_expires_at']) {
            return false;
        }
        $hash = password_hash($newPassword, PASSWORD_BCRYPT);
        Database::pdo()
            ->prepare(
                'UPDATE users
                    SET password_hash = ?,
                        reset_token_hash = NULL,
                        reset_token_expires_at = NULL
                  WHERE id = ?'
            )
            ->execute([$hash, (int) $row['id']]);

        $path = self::resetTokenFilePath();
        if (is_file($path)) {
            @unlink($path);
        }
        return true;
    }

    private static function writeResetTokenFile(string $username, string $token, string $expiresAt): void
    {
        $path = self::resetTokenFilePath();
        $dir  = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $content = "=== my-expense | RECUPERO PASSWORD ===\r\n"
                 . "Generato:  " . date('Y-m-d H:i:s') . "\r\n"
                 . "Utente:    " . $username . "\r\n"
                 . "Scadenza:  " . $expiresAt . " (validita' " . self::RESET_TTL_MINUTES . " minuti)\r\n"
                 . "\r\n"
                 . "Codice di recupero (copialo nella pagina /password/reset):\r\n"
                 . "\r\n"
                 . "    " . $token . "\r\n"
                 . "\r\n"
                 . "Il codice e' a uso singolo: dopo aver impostato la nuova password\r\n"
                 . "questo file verra' cancellato automaticamente.\r\n";
        @file_put_contents($path, $content, LOCK_EX);
    }
}
