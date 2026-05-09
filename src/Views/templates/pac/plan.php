<?php
/**
 * @var \App\Views\View $this
 * @var array<string,mixed> $plan
 *
 * Dettaglio piano PAC: KPI, lista versamenti, form versamento manuale,
 * form aggiorna NAV + storico, bottone "genera ora".
 */

$this->extends('layouts.app');
$this->section('content');

$base = rtrim((string) (\App\Config::get('app')['base_url'] ?? ''), '/');
$freqLabel = [
    'weekly'    => 'Settimanale',
    'monthly'   => 'Mensile',
    'quarterly' => 'Trimestrale',
    'yearly'    => 'Annuale',
][$plan['frequency']] ?? $plan['frequency'];
?>
<div class="row mb-3">
    <div class="col-12 d-flex flex-wrap align-items-center gap-2">
        <a href="<?= $this->escape($base . '/pac') ?>" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-chevron-left"></i> Torna
        </a>
        <div class="ms-2">
            <h1 class="h3 mb-0"><?= $this->escape($plan['name']) ?></h1>
            <div class="text-muted small">
                <?= $this->escape($freqLabel) ?> · €<?= $this->escape($plan['amount']) ?> ·
                <?= $this->escape($plan['fund_name'] ?? '—') ?>
                <?php if (!empty($plan['asset_class_name'])): ?>
                    · <span class="badge" style="background:<?= $this->escape($plan['asset_class_color'] ?? '#6c757d') ?>"><?= $this->escape($plan['asset_class_name']) ?></span>
                <?php endif; ?>
                <?php if ((int) $plan['active'] === 0): ?>
                    · <span class="badge bg-secondary">disattivato</span>
                <?php endif; ?>
            </div>
        </div>
        <div class="ms-auto">
            <button type="button" class="btn btn-sm btn-outline-primary" id="plan-run-now"
                    data-id="<?= (int) $plan['id'] ?>">
                <i class="bi bi-play-circle me-1"></i>Genera ora
            </button>
        </div>
    </div>
</div>

<div class="row g-3 mb-3" id="plan-kpi"></div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-cash-coin me-1"></i>Versamento manuale</h2>
        <form id="contribution-create-form" class="row g-2">
            <?= $this->csrfField() ?>
            <input type="hidden" name="plan_id" value="<?= (int) $plan['id'] ?>">
            <div class="col-7">
                <label class="form-label small mb-1">Importo (€)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required value="<?= $this->escape($plan['amount']) ?>">
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="contribution_date" class="form-control" required value="<?= date('Y-m-d') ?>">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Note</label>
                <input type="text" name="notes" class="form-control" maxlength="255">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Versa
                </button>
            </div>
        </form>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-cash me-1"></i>Aggiorna NAV fondo</h2>
        <form id="nav-update-form" class="row g-2">
            <?= $this->csrfField() ?>
            <input type="hidden" name="fund_id" value="<?= (int) $plan['fund_id'] ?>">
            <div class="col-7">
                <label class="form-label small mb-1">NAV</label>
                <input type="text" name="nav" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="nav_date" class="form-control" required value="<?= date('Y-m-d') ?>">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-secondary">
                    <i class="bi bi-check-circle me-1"></i>Salva NAV
                </button>
            </div>
        </form>
        <hr class="my-3">
        <div class="small text-muted mb-2">Storico NAV recente</div>
        <div id="nav-history">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-clock-history me-1"></i>Versamenti</h2>
        <div id="contributions-list">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</section>
</div>

<script>
window.MX_PLAN = <?= json_encode([
    'id'                => (int) $plan['id'],
    'fund_id'           => (int) $plan['fund_id'],
    'amount'            => $plan['amount'],
    'name'              => $plan['name'],
    'source_account_id' => $plan['source_account_id'],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
</script>
<script type="module" src="<?= $this->asset('js/pages/pac-plan.js') ?>"></script>
<?php $this->endSection(); ?>
