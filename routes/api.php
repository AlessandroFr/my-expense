<?php
declare(strict_types=1);

/**
 * Route JSON (endpoint). Caricate da App\Http\Kernel::loadRoutes().
 *
 * Formato tuple: [method, path, [Controller::class, 'action'], middleware[]]
 *
 * Popolato per dominio da C6 in poi (Expenses pilota).
 */

use App\Controllers\BudgetController;
use App\Controllers\CategoryController;
use App\Controllers\ExpenseController;

return [
    // Expenses
    ['GET',  '/expenses/list',           [ExpenseController::class, 'list'],   ['auth']],
    ['POST', '/expenses/create',         [ExpenseController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/expenses/update',         [ExpenseController::class, 'update'], ['auth', 'csrf']],
    ['POST', '/expenses/delete',         [ExpenseController::class, 'delete'], ['auth', 'csrf']],
    ['GET',  '/expenses/export',         [ExpenseController::class, 'export'], ['auth']],
    ['POST', '/expenses/import',         [ExpenseController::class, 'import'], ['auth', 'csrf']],

    // Categories
    ['POST', '/categories/create',       [CategoryController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/categories/update',       [CategoryController::class, 'update'], ['auth', 'csrf']],
    ['POST', '/categories/delete',       [CategoryController::class, 'delete'], ['auth', 'csrf']],

    // Budgets
    ['GET',  '/budgets/list',            [BudgetController::class, 'list'],   ['auth']],
    ['POST', '/budgets/set',             [BudgetController::class, 'set'],    ['auth', 'csrf']],
    ['POST', '/budgets/delete',          [BudgetController::class, 'delete'], ['auth', 'csrf']],
];
