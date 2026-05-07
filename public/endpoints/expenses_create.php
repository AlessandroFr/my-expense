<?php
declare(strict_types=1);

/**
 * POST /expenses/create — JSON envelope.
 */

use App\Auth;
use App\Budget;
use App\Contact;
use App\Csrf;
use App\Expense;
use App\Json;

if (!Auth::check()) {
    Json::error('Sessione scaduta.', Json::ERR_UNAUTH, 401);
}
if (!Csrf::check()) {
    Json::error('Token CSRF non valido.', Json::ERR_CSRF, 403);
}

$catRaw        = $_POST['category_id'] ?? '';
$categoryId    = ($catRaw === '' || $catRaw === null || $catRaw === '0') ? null : (int) $catRaw;
$accRaw        = $_POST['account_id'] ?? '';
$accountId     = ($accRaw === '' || $accRaw === null || $accRaw === '0') ? null : (int) $accRaw;
$amount        = (string) ($_POST['amount'] ?? '0');
$description   = isset($_POST['description']) ? (string) $_POST['description'] : null;
$paymentMethod = (string) ($_POST['payment_method'] ?? 'card');
$expenseDate   = (string) ($_POST['expense_date'] ?? date('Y-m-d'));
$sharedWith    = ($_POST['shared_with']  ?? '') === '' ? null : (string) $_POST['shared_with'];
$shareAmount   = ($_POST['share_amount'] ?? '') === '' ? null : (string) $_POST['share_amount'];
$userId        = (int) Auth::userId();

$contactRaw  = $_POST['contact_id']   ?? '';
$contactName = trim((string) ($_POST['contact_name'] ?? ''));
$contactId   = null;

try {
    if ($contactRaw !== '' && $contactRaw !== '0') {
        $contactId = (int) $contactRaw;
    } elseif ($contactName !== '') {
        $contactId = Contact::findOrCreate($userId, $contactName, 'supplier');
    }
    $id  = Expense::create($userId, $categoryId, $amount, $description, $paymentMethod, $expenseDate, $accountId, $sharedWith, $shareAmount, $contactId);
    $row = Expense::findForUser($id, $userId);
    $ym  = substr($expenseDate, 0, 7);
    $budgetWarning = Budget::checkForCategory($userId, $categoryId, $ym);
} catch (InvalidArgumentException $e) {
    Json::error($e->getMessage(), Json::ERR_VALIDATION, 400);
} catch (Throwable $e) {
    Json::serverError($e);
}

Json::ok([
    'expense'        => $row,
    'budget_warning' => $budgetWarning,
]);
