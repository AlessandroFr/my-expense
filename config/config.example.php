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
        // URL base sotto cui l'app è servita. Con `avvia.cmd` l'app sta alla
        // radice, quindi va lasciata vuota. Serve solo se la ospiti in una
        // sottocartella (es. '/my-expense' sotto htdocs).
        'base_url' => '',
        'debug'    => true,
    ],

    // Il database e' un singolo file SQLite. Per farne il backup basta
    // copiarlo (chiudendo prima l'app). Path relativo = dalla root del progetto.
    'db' => [
        'path' => 'data/my-expense.sqlite',
    ],

    'session' => [
        'name'     => 'my_expense_sid',
        'lifetime' => 86400,
    ],
];
