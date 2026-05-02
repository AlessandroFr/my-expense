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
}
