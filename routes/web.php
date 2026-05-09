<?php
declare(strict_types=1);

/**
 * Route HTML (page). Caricate da App\Http\Kernel::loadRoutes().
 * Formato tuple: [method, path, [Controller::class, 'action'], middleware[]]
 */

use App\Controllers\AccountController;
use App\Controllers\AuthController;
use App\Controllers\BudgetController;
use App\Controllers\CategoryController;
use App\Controllers\ContactController;
use App\Controllers\DashboardController;
use App\Controllers\ExpenseController;
use App\Controllers\IncomeController;
use App\Controllers\RecurringController;
use App\Controllers\ReportController;
use App\Controllers\SettingsController;
use App\Controllers\TransferController;

return [
    // Auth (no middleware -- pre-login pages)
    ['GET', '/setup',            [AuthController::class,     'showSetup'], []],
    ['GET', '/login',            [AuthController::class,     'showLogin'], []],

    // Dashboard
    ['GET', '/',                 [DashboardController::class,'index'],  ['auth']],
    ['GET', '/dashboard',        [DashboardController::class,'index'],  ['auth']],

    // Domain pages
    ['GET', '/expenses',         [ExpenseController::class,  'index'],  ['auth']],
    ['GET', '/categories',       [CategoryController::class, 'index'],  ['auth']],
    ['GET', '/categories/edit',  [CategoryController::class, 'edit'],   ['auth']],
    ['GET', '/budgets',          [BudgetController::class,   'index'],  ['auth']],
    ['GET', '/incomes',          [IncomeController::class,   'index'],  ['auth']],
    ['GET', '/accounts',         [AccountController::class,  'index'],  ['auth']],
    ['GET', '/transfers',        [TransferController::class, 'index'],  ['auth']],
    ['GET', '/recurring',        [RecurringController::class,'index'],  ['auth']],
    ['GET', '/contacts',         [ContactController::class,  'index'],  ['auth']],
    ['GET', '/contacts/detail',  [ContactController::class,  'detail'], ['auth']],
    ['GET', '/reports',          [ReportController::class,   'index'],  ['auth']],
    ['GET', '/settings',         [SettingsController::class, 'index'],  ['auth']],
];
