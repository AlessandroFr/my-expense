<?php
declare(strict_types=1);

/**
 * Route HTML (page). Caricate da App\Http\Kernel::loadRoutes().
 *
 * Formato tuple: [method, path, [Controller::class, 'action'], middleware[]]
 *
 * Popolato per dominio da C6 in poi (Expenses pilota).
 */

use App\Controllers\CategoryController;
use App\Controllers\ExpenseController;

return [
    ['GET', '/expenses',         [ExpenseController::class,  'index'], ['auth']],
    ['GET', '/categories',       [CategoryController::class, 'index'], ['auth']],
    ['GET', '/categories/edit',  [CategoryController::class, 'edit'],  ['auth']],
];
