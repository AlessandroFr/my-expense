<?php
declare(strict_types=1);

namespace App;

final class Csrf
{
    private const SESSION_KEY = '_csrf';
    private const COOKIE_NAME = 'csrf_token';

    public static function token(): string
    {
        if (empty($_SESSION[self::SESSION_KEY])) {
            $_SESSION[self::SESSION_KEY] = bin2hex(random_bytes(32));
        }
        $token = $_SESSION[self::SESSION_KEY];
        self::syncCookie($token);
        return $token;
    }

    public static function check(?string $token = null): bool
    {
        $expected = $_SESSION[self::SESSION_KEY] ?? null;
        if (!is_string($expected) || $expected === '') {
            return false;
        }
        if ($token === null) {
            $token = $_POST['_csrf']
                ?? $_SERVER['HTTP_X_CSRF_TOKEN']
                ?? null;
        }
        return is_string($token) && hash_equals($expected, $token);
    }

    public static function field(): string
    {
        $token = htmlspecialchars(self::token(), ENT_QUOTES, 'UTF-8');
        return '<input type="hidden" name="_csrf" value="' . $token . '">';
    }

    /**
     * Cookie usato da public/js/FetchRequest.js per popolare l'header X-CSRF-Token.
     * httpOnly=false è necessario perché il JS deve poter leggere document.cookie.
     */
    private static function syncCookie(string $token): void
    {
        if (headers_sent()) {
            return;
        }
        $current = $_COOKIE[self::COOKIE_NAME] ?? null;
        if ($current === $token) {
            return;
        }
        setcookie(self::COOKIE_NAME, $token, [
            'expires'  => 0,
            'path'     => '/',
            'secure'   => false,
            'httponly' => false,
            'samesite' => 'Lax',
        ]);
        $_COOKIE[self::COOKIE_NAME] = $token;
    }
}
