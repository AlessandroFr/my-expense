<?php
/**
 * Pagina lista spese — AJAX via FetchRequest.
 * La tabella e il totale sono popolati lato client da public/js/pages/expenses.js.
 */

use App\Auth;
use App\Category;
use App\Config;
use App\Csrf;
use App\Expense;

$base       = rtrim(Config::get('app')['base_url'] ?? '', '/');
$userId     = (int) Auth::userId();
$categories = Category::allForUser($userId);
$today      = date('Y-m-d');
$paymentMethods = Expense::PAYMENT_METHODS;
$paymentLabels  = [
    'cash'     => 'Contanti',
    'card'     => 'Carta',
    'transfer' => 'Bonifico',
    'other'    => 'Altro',
];
?>
<div class="row mb-3 align-items-center">
    <div class="col-md-6"><h1 class="h3 mb-0"><i class="bi bi-receipt me-2"></i>Spese</h1></div>
    <div class="col-md-6 text-md-end">
        <span class="text-muted small">Totale filtrato: </span>
        <span id="expenses-total" class="fw-semibold fs-5">€ 0,00</span>
        <span class="text-muted small ms-2" id="expenses-count">(0 voci)</span>
    </div>
</div>

<!-- ── Filtri ────────────────────────────────────────────────────────────── -->
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <form id="expenses-filters" class="row g-2 align-items-end">
            <div class="col-md-2">
                <label class="form-label small">Da</label>
                <input type="date" name="date_from" class="form-control form-control-sm">
            </div>
            <div class="col-md-2">
                <label class="form-label small">A</label>
                <input type="date" name="date_to" class="form-control form-control-sm">
            </div>
            <div class="col-md-2">
                <label class="form-label small">Categoria</label>
                <select name="category_id" class="form-select form-select-sm">
                    <option value="">Tutte</option>
                    <?php foreach ($categories as $c): ?>
                        <option value="<?= (int) $c['id'] ?>"><?= htmlspecialchars((string) $c['name'], ENT_QUOTES, 'UTF-8') ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-1">
                <label class="form-label small">Min €</label>
                <input type="number" step="0.01" min="0" name="amount_min" class="form-control form-control-sm">
            </div>
            <div class="col-md-1">
                <label class="form-label small">Max €</label>
                <input type="number" step="0.01" min="0" name="amount_max" class="form-control form-control-sm">
            </div>
            <div class="col-md-3">
                <label class="form-label small">Cerca</label>
                <input type="text" name="search" class="form-control form-control-sm" placeholder="descrizione…">
            </div>
            <div class="col-md-1 d-grid">
                <button type="button" id="filters-reset" class="btn btn-sm btn-outline-secondary" title="Resetta filtri">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </form>
    </div>
</div>

<!-- ── Form CREATE inline ───────────────────────────────────────────────── -->
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 text-muted mb-3"><i class="bi bi-plus-circle me-1"></i>Nuova spesa</h2>
        <form id="expense-create-form" class="row g-2 align-items-end" autocomplete="off">
            <?= Csrf::field() ?>
            <div class="col-md-2">
                <label class="form-label small">Data</label>
                <input type="date" name="expense_date" class="form-control" required value="<?= htmlspecialchars($today, ENT_QUOTES, 'UTF-8') ?>">
            </div>
            <div class="col-md-2">
                <label class="form-label small">Importo €</label>
                <input type="number" step="0.01" min="0.01" name="amount" class="form-control" required placeholder="0,00">
            </div>
            <div class="col-md-2">
                <label class="form-label small">Categoria</label>
                <select name="category_id" class="form-select">
                    <option value="">— Nessuna —</option>
                    <?php foreach ($categories as $c): ?>
                        <option value="<?= (int) $c['id'] ?>"><?= htmlspecialchars((string) $c['name'], ENT_QUOTES, 'UTF-8') ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label small">Pagamento</label>
                <select name="payment_method" class="form-select" required>
                    <?php foreach ($paymentMethods as $pm): ?>
                        <option value="<?= htmlspecialchars($pm, ENT_QUOTES, 'UTF-8') ?>" <?= $pm === 'card' ? 'selected' : '' ?>>
                            <?= htmlspecialchars($paymentLabels[$pm] ?? $pm, ENT_QUOTES, 'UTF-8') ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label small">Descrizione <span class="text-muted">(opz.)</span></label>
                <input type="text" name="description" class="form-control" maxlength="255" placeholder="es. Pranzo bar">
            </div>
            <div class="col-md-1 d-grid">
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i></button>
            </div>
        </form>
    </div>
</div>

<!-- ── Tabella spese ─────────────────────────────────────────────────────── -->
<div class="card shadow-sm">
    <div class="card-body p-0">
        <table class="table table-hover mb-0 align-middle">
            <thead class="table-light">
                <tr>
                    <th>Data</th>
                    <th>Categoria</th>
                    <th>Descrizione</th>
                    <th>Pagamento</th>
                    <th class="text-end">Importo</th>
                    <th class="text-end" style="width:1%">Azioni</th>
                </tr>
            </thead>
            <tbody id="expenses-tbody">
                <tr id="expenses-loading">
                    <td colspan="6" class="text-center text-muted py-4">
                        <span class="spinner-border spinner-border-sm me-2"></span>Carico…
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>

<script type="module" src="<?= htmlspecialchars($base . '/js/pages/expenses.js', ENT_QUOTES, 'UTF-8') ?>"></script>
