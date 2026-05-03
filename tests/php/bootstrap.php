<?php
declare(strict_types=1);

// PHPUnit bootstrap: carica l'autoloader Composer (produzione + dev).
// I test Unit NON toccano DB; i test Integration che richiedono DB devono
// caricare esplicitamente la config (es. via Tests\TestCase::bootApp).

require __DIR__ . '/../../vendor/autoload.php';
