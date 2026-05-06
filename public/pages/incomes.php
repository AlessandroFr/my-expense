<?php
/**
 * Entrate — CRUD speculare alle spese ma con `source` libero (no categoria).
 */

use App\Account;
use App\Auth;
use App\Config;

$base     = rtrim(Config::get('app')['base_url'] ?? '', '/');
$userId   = (int) Auth::userId();
$accounts = Account::allForUser($userId, false);
?>
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-cash-stack me-2 text-success"></i>Entrate</h1>
        <div class="text-muted small">Stipendi, rimborsi, freelance — tutto cio' che entra.</div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm mb-3">
    <div class="card-body py-3">
        <h2 class="h6 mb-3"><i class="bi bi-funnel me-1"></i>Filtri</h2>
        <form id="income-filters" class="row g-2 align-items-end">
            <div class="col-6">
                <label class="form-label small mb-1">Da</label>
                <input type="date" name="date_from" class="form-control form-control-sm">
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">A</label>
                <input type="date" name="date_to" class="form-control form-control-sm">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Origine</label>
                <select name="source" class="form-select form-select-sm">
                    <option value="">Tutte</option>
                </select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Conto</label>
                <select name="account_id" class="form-select form-select-sm">
                    <option value="">Tutti</option>
                    <?php foreach ($accounts as $a): ?>
                        <option value="<?= (int) $a['id'] ?>"><?= htmlspecialchars((string) $a['name'], ENT_QUOTES, 'UTF-8') ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Cerca</label>
                <input type="text" name="search" class="form-control form-control-sm" placeholder="origine o descrizione">
            </div>
            <div class="col-12 d-grid">
                <button type="button" id="income-filters-reset" class="btn btn-outline-secondary btn-sm">
                    <i class="bi bi-x-circle me-1"></i>Reset
                </button>
            </div>
        </form>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Nuova entrata</h2>
        <form id="income-create-form" class="row g-2 align-items-end">
            <div class="col-6">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="income_date" class="form-control" value="<?= date('Y-m-d') ?>" required>
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Importo (EUR)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Origine</label>
                <input type="text" name="source" class="form-control" list="income-sources" placeholder="Stipendio, Freelance..." required maxlength="64">
                <datalist id="income-sources"></datalist>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Conto <span class="text-muted">(opz.)</span></label>
                <select name="account_id" class="form-select">
                    <option value="">— Nessuno —</option>
                    <?php foreach ($accounts as $a): ?>
                        <option value="<?= (int) $a['id'] ?>"><?= htmlspecialchars((string) $a['name'], ENT_QUOTES, 'UTF-8') ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Descrizione</label>
                <input type="text" name="description" class="form-control" maxlength="512" placeholder="Note opzionali">
            </div>
            <div class="col-12 d-grid">
                <button type="submit" class="btn btn-success">
                    <i class="bi bi-check-circle me-1"></i>Aggiungi
                </button>
            </div>
        </form>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <nav id="income-pager" class="px-3 pt-2"></nav>
    <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
            <thead class="table-light">
                <tr>
                    <th style="width:100px">Data</th>
                    <th style="width:140px">Conto</th>
                    <th style="width:160px">Origine</th>
                    <th>Descrizione</th>
                    <th class="text-end" style="width:120px">Importo</th>
                    <th style="width:120px"></th>
                </tr>
            </thead>
            <tbody id="income-tbody">
                <tr><td colspan="6" class="text-center text-muted py-4">
                    <div class="spinner-border spinner-border-sm me-2"></div>Caricamento...
                </td></tr>
            </tbody>
            <tfoot>
                <tr class="table-light">
                    <th colspan="4" class="text-end">Totale visibile</th>
                    <th class="text-end" id="income-total">EUR -</th>
                    <th></th>
                </tr>
            </tfoot>
        </table>
    </div>
</div>
</section>
</div>

<script type="module" src="<?= $asset('js/pages/incomes.js') ?>"></script>
