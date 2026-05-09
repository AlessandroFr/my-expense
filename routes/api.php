<?php
declare(strict_types=1);

/**
 * Route JSON (endpoint). Caricate da App\Http\Kernel::loadRoutes().
 * Formato tuple: [method, path, [Controller::class, 'action'], middleware[]]
 */

use App\Controllers\AccountController;
use App\Controllers\AttachmentController;
use App\Controllers\AuthController;
use App\Controllers\BackupController;
use App\Controllers\BankImportController;
use App\Controllers\BudgetController;
use App\Controllers\CategoryController;
use App\Controllers\ContactController;
use App\Controllers\DashboardController;
use App\Controllers\ExpenseController;
use App\Controllers\FilterController;
use App\Controllers\IncomeController;
use App\Controllers\RecurringController;
use App\Controllers\ReportController;
use App\Controllers\SettingsController;
use App\Controllers\TagController;

return [
    // Auth
    ['POST', '/setup',                   [AuthController::class,    'setup'],  []],
    ['POST', '/login',                   [AuthController::class,    'login'],  []],
    ['POST', '/logout',                  [AuthController::class,    'logout'], ['auth']],

    // Dashboard
    ['GET',  '/dashboard/data',          [DashboardController::class,'data'],  ['auth']],

    // Expenses
    ['GET',  '/expenses/list',           [ExpenseController::class, 'list'],   ['auth']],
    ['POST', '/expenses/create',         [ExpenseController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/expenses/update',         [ExpenseController::class, 'update'], ['auth', 'csrf']],
    ['POST', '/expenses/delete',         [ExpenseController::class, 'delete'], ['auth', 'csrf']],
    ['GET',  '/expenses/export',         [ExpenseController::class, 'export'], ['auth']],
    ['POST', '/expenses/import',         [ExpenseController::class, 'import'], ['auth', 'csrf']],
    ['POST', '/import/bank-statement/preview', [BankImportController::class, 'preview'], ['auth', 'csrf']],
    ['POST', '/import/bank-statement/commit',  [BankImportController::class, 'commit'],  ['auth', 'csrf']],

    // Categories
    ['POST', '/categories/create',       [CategoryController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/categories/update',       [CategoryController::class, 'update'], ['auth', 'csrf']],
    ['POST', '/categories/delete',       [CategoryController::class, 'delete'], ['auth', 'csrf']],

    // Budgets
    ['GET',  '/budgets/list',            [BudgetController::class, 'list'],   ['auth']],
    ['POST', '/budgets/set',             [BudgetController::class, 'set'],    ['auth', 'csrf']],
    ['POST', '/budgets/delete',          [BudgetController::class, 'delete'], ['auth', 'csrf']],

    // Tags
    ['GET',  '/tags/list',               [TagController::class, 'list'],   ['auth']],
    ['POST', '/tags/assign',             [TagController::class, 'assign'], ['auth', 'csrf']],
    ['POST', '/tags/delete',             [TagController::class, 'delete'], ['auth', 'csrf']],

    // Saved filters
    ['GET',  '/filters/list',            [FilterController::class, 'list'],   ['auth']],
    ['POST', '/filters/save',            [FilterController::class, 'save'],   ['auth', 'csrf']],
    ['POST', '/filters/delete',          [FilterController::class, 'delete'], ['auth', 'csrf']],

    // Incomes
    ['GET',  '/incomes/list',            [IncomeController::class, 'list'],   ['auth']],
    ['POST', '/incomes/create',          [IncomeController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/incomes/update',          [IncomeController::class, 'update'], ['auth', 'csrf']],
    ['POST', '/incomes/delete',          [IncomeController::class, 'delete'], ['auth', 'csrf']],

    // Accounts (+reconciliation)
    ['GET',  '/accounts/list',                  [AccountController::class, 'list'],   ['auth']],
    ['POST', '/accounts/create',                [AccountController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/accounts/update',                [AccountController::class, 'update'], ['auth', 'csrf']],
    ['POST', '/accounts/delete',                [AccountController::class, 'delete'], ['auth', 'csrf']],
    ['POST', '/accounts/reconcile',             [AccountController::class, 'reconcile'],            ['auth', 'csrf']],
    ['GET',  '/accounts/reconciliations',       [AccountController::class, 'reconciliations'],      ['auth']],
    ['POST', '/accounts/reconciliation/delete', [AccountController::class, 'reconciliationDelete'], ['auth', 'csrf']],

    // Recurring expenses
    ['GET',  '/recurring/list',          [RecurringController::class, 'list'],   ['auth']],
    ['POST', '/recurring/create',        [RecurringController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/recurring/update',        [RecurringController::class, 'update'], ['auth', 'csrf']],
    ['POST', '/recurring/toggle',        [RecurringController::class, 'toggle'], ['auth', 'csrf']],
    ['POST', '/recurring/delete',        [RecurringController::class, 'delete'], ['auth', 'csrf']],
    ['POST', '/recurring/run',           [RecurringController::class, 'run'],    ['auth', 'csrf']],

    // Contacts
    ['GET',  '/contacts/list',           [ContactController::class, 'list'],      ['auth']],
    ['GET',  '/contacts/balance',        [ContactController::class, 'balance'],   ['auth']],
    ['GET',  '/contacts/movements',      [ContactController::class, 'movements'], ['auth']],
    ['POST', '/contacts/create',         [ContactController::class, 'create'],    ['auth', 'csrf']],
    ['POST', '/contacts/update',         [ContactController::class, 'update'],    ['auth', 'csrf']],
    ['POST', '/contacts/archive',        [ContactController::class, 'archive'],   ['auth', 'csrf']],
    ['POST', '/contacts/delete',         [ContactController::class, 'delete'],    ['auth', 'csrf']],
    ['POST', '/contacts/reassign',       [ContactController::class, 'reassign'],  ['auth', 'csrf']],

    // Reports
    ['GET',  '/reports/year',            [ReportController::class, 'year'], ['auth']],

    // Attachments
    ['GET',  '/attachments/list',        [AttachmentController::class, 'list'],     ['auth']],
    ['POST', '/attachments/upload',      [AttachmentController::class, 'upload'],   ['auth', 'csrf']],
    ['POST', '/attachments/delete',      [AttachmentController::class, 'delete'],   ['auth', 'csrf']],
    ['GET',  '/attachments/download',    [AttachmentController::class, 'download'], ['auth']],

    // Backup
    ['GET',  '/backup/download',         [BackupController::class, 'download'], ['auth']],
    ['POST', '/backup/restore',          [BackupController::class, 'restore'],  ['auth', 'csrf']],

    // Settings / DB reset
    ['POST', '/db/reset',                [SettingsController::class, 'dbReset'], ['auth', 'csrf']],
];
