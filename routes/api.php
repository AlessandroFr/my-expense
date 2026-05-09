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
use App\Controllers\PacController;
use App\Controllers\RecurringController;
use App\Controllers\ReportController;
use App\Controllers\SecuritiesController;
use App\Controllers\SettingsController;
use App\Controllers\TagController;
use App\Controllers\TransferController;

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

    // Transfers (atomic between-accounts movement)
    ['GET',  '/transfers/list',          [TransferController::class, 'list'],   ['auth']],
    ['POST', '/transfers/create',        [TransferController::class, 'create'], ['auth', 'csrf']],
    ['POST', '/transfers/delete',        [TransferController::class, 'delete'], ['auth', 'csrf']],

    // Securities (instruments + transactions + prices + asset classes + holdings)
    ['GET',  '/securities/list',                 [SecuritiesController::class, 'listInstruments'],   ['auth']],
    ['GET',  '/securities/holdings',             [SecuritiesController::class, 'holdings'],         ['auth']],
    ['POST', '/securities/instrument/create',    [SecuritiesController::class, 'createInstrument'], ['auth', 'csrf']],
    ['POST', '/securities/instrument/update',    [SecuritiesController::class, 'updateInstrument'], ['auth', 'csrf']],
    ['POST', '/securities/instrument/archive',   [SecuritiesController::class, 'archiveInstrument'],['auth', 'csrf']],
    ['POST', '/securities/instrument/delete',    [SecuritiesController::class, 'deleteInstrument'], ['auth', 'csrf']],
    ['GET',  '/securities/transactions/list',    [SecuritiesController::class, 'listTransactions'], ['auth']],
    ['POST', '/securities/transactions/create',  [SecuritiesController::class, 'createTransaction'],['auth', 'csrf']],
    ['POST', '/securities/transactions/delete',  [SecuritiesController::class, 'deleteTransaction'],['auth', 'csrf']],
    ['GET',  '/securities/prices',               [SecuritiesController::class, 'listPrices'],       ['auth']],
    ['POST', '/securities/prices/update',        [SecuritiesController::class, 'updatePrice'],      ['auth', 'csrf']],
    ['POST', '/securities/prices/delete',        [SecuritiesController::class, 'deletePrice'],      ['auth', 'csrf']],
    ['GET',  '/securities/asset-classes',        [SecuritiesController::class, 'listAssetClasses'], ['auth']],
    ['POST', '/securities/asset-classes/create', [SecuritiesController::class, 'createAssetClass'], ['auth', 'csrf']],
    ['POST', '/securities/asset-classes/update', [SecuritiesController::class, 'updateAssetClass'], ['auth', 'csrf']],
    ['POST', '/securities/asset-classes/delete', [SecuritiesController::class, 'deleteAssetClass'], ['auth', 'csrf']],

    // PAC (funds, plans, contributions)
    ['GET',  '/pac/funds',                  [PacController::class, 'listFunds'],          ['auth']],
    ['POST', '/pac/funds/create',           [PacController::class, 'createFund'],         ['auth', 'csrf']],
    ['POST', '/pac/funds/update',           [PacController::class, 'updateFund'],         ['auth', 'csrf']],
    ['POST', '/pac/funds/delete',           [PacController::class, 'deleteFund'],         ['auth', 'csrf']],
    ['GET',  '/pac/funds/navs',             [PacController::class, 'listNavs'],           ['auth']],
    ['POST', '/pac/funds/nav-update',       [PacController::class, 'updateNav'],          ['auth', 'csrf']],
    ['POST', '/pac/funds/nav-delete',       [PacController::class, 'deleteNav'],          ['auth', 'csrf']],
    ['GET',  '/pac/plans',                  [PacController::class, 'listPlans'],          ['auth']],
    ['POST', '/pac/plans/create',           [PacController::class, 'createPlan'],         ['auth', 'csrf']],
    ['POST', '/pac/plans/update',           [PacController::class, 'updatePlan'],         ['auth', 'csrf']],
    ['POST', '/pac/plans/toggle',           [PacController::class, 'togglePlan'],         ['auth', 'csrf']],
    ['POST', '/pac/plans/delete',           [PacController::class, 'deletePlan'],         ['auth', 'csrf']],
    ['POST', '/pac/plans/run',              [PacController::class, 'runPlan'],            ['auth', 'csrf']],
    ['GET',  '/pac/contributions',          [PacController::class, 'listContributions'],  ['auth']],
    ['POST', '/pac/contributions/create',   [PacController::class, 'createContribution'], ['auth', 'csrf']],
    ['POST', '/pac/contributions/delete',   [PacController::class, 'deleteContribution'], ['auth', 'csrf']],
    ['POST', '/pac/run-pending',            [PacController::class, 'runPending'],         ['auth', 'csrf']],

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
