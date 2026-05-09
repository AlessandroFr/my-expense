<?php
declare(strict_types=1);

namespace App\Validation;

/**
 * Interfaccia per regole di validazione custom istanziabili.
 * Le regole built-in (required, numeric, in:[], ecc.) sono implementate
 * inline nel Validator come metodi privati per performance e leggibilita'.
 *
 * Restituisce true se valida, oppure una stringa con il messaggio di errore.
 */
interface Rule
{
    /**
     * @param array<string, mixed> $all
     */
    public function passes(string $field, mixed $value, array $all): bool|string;
}
