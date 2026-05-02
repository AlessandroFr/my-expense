<?php
declare(strict_types=1);

/**
 * POST /expenses/create — JSON envelope.
 */

use App\Auth;
use App\Budget;
use App\Csrf;
use App\Expense;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', 'unauthenticated', 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', 'csrf', 419);
}

$catRaw        = $_POST['category_id'] ?? '';
$categoryId    = ($catRaw === '' || $catRaw === null || $catRaw === '0') ? null : (int) $catRaw;
$amount        = (string) ($_POST['amount'] ?? '0');
$description   = isset($_POST['description']) ? (string) $_POST['description'] : null;
$paymentMethod = (string) ($_POST['payment_method'] ?? 'card');
$expenseDate   = (string) ($_POST['expense_date'] ?? date('Y-m-d'));
$userId        = (int) Auth::userId();

try {
    $id  = Expense::create($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate);
    $row = Expense::findForUser($id, $userId);
    $ym  = substr($expenseDate, 0, 7);
    $budgetWarning = Budget::checkForCategory($userId, $categoryId, $ym);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), 'validation', 400);
} catch (Throwable $e) {
    Json::error('Errore server: ' . $e->getMessage(), 'server', 500);
}

Json::ok([
    'expense'        => $row,
    'budget_warning' => $budgetWarning,
]);
