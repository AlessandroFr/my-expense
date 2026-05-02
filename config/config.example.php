<?php
/**
 * Template di configurazione. Copia questo file in `config/config.php`
 * e modifica i valori per il tuo ambiente locale.
 *
 * `config/config.php` è gitignored — non committare credenziali reali.
 */

return [
    'app' => [
        'name'     => 'My Expense',
        // URL base sotto cui l'app è servita (es. '/my-expense' se sotto htdocs/my-expense).
        // Lascia stringa vuota se servi direttamente da DocumentRoot.
        'base_url' => '/my-expense',
        'debug'    => true,
    ],

    'db' => [
        'host'     => '127.0.0.1',
        'port'     => 3306,
        'database' => 'my_expense',
        'username' => 'root',
        'password' => '',
        'charset'  => 'utf8mb4',
    ],

    'session' => [
        'name'     => 'my_expense_sid',
        'lifetime' => 86400,
    ],
];
