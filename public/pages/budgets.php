<?php
/**
 * Budget mensili — gestione tetto di spesa per categoria, con barra di progresso.
 */

use App\Config;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
$currentMonth = date('Y-m');
?>
<div class="row mb-3 align-items-center">
    <div class="col-md-6">
        <h1 class="h3 mb-0"><i class="bi bi-bullseye me-2"></i>Budget mensili</h1>
        <div class="text-muted small">Imposta un tetto di spesa per categoria e monitora il progresso.</div>
    </div>
    <div class="col-md-6 text-md-end">
        <label class="form-label mb-0 me-2">Mese:</label>
        <input type="month" id="budget-month" class="form-control d-inline-block" style="width:auto"
               value="<?= htmlspecialchars($currentMonth, ENT_QUOTES, 'UTF-8') ?>">
    </div>
</div>

<div class="card shadow-sm mb-4">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Imposta budget</h2>
        <form id="budget-form" class="row g-2 align-items-end">
            <div class="col-md-6">
                <label class="form-label small mb-1">Categoria</label>
                <select name="category_id" class="form-select" required></select>
            </div>
            <div class="col-md-4">
                <label class="form-label small mb-1">Importo (€)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-md-2 d-grid">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Salva
                </button>
            </div>
        </form>
    </div>
</div>

<div id="budget-list" class="row g-3">
    <div class="col-12 text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
    </div>
</div>

<script type="module" src="<?= $asset('js/pages/budgets.js') ?>"></script>
