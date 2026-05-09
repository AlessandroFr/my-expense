<?php
/**
 * @var \App\Views\View $this
 * @var array<string,mixed> $instrument
 *
 * Dettaglio strumento: prezzi storici, transazioni, form upsert quotazione.
 */

$this->extends('layouts.app');
$this->section('content');

$base = rtrim((string) (\App\Config::get('app')['base_url'] ?? ''), '/');
?>
<div class="row mb-3">
    <div class="col-12 d-flex align-items-center flex-wrap gap-2">
        <a href="<?= $this->escape($base . '/securities') ?>" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-chevron-left"></i> Torna
        </a>
        <div class="ms-2">
            <h1 class="h3 mb-0"><?= $this->escape($instrument['name']) ?></h1>
            <div class="text-muted small">
                <?php if (!empty($instrument['ticker'])): ?>
                    <span class="badge bg-secondary me-1"><?= $this->escape($instrument['ticker']) ?></span>
                <?php endif; ?>
                <?php if (!empty($instrument['isin'])): ?>
                    ISIN: <code><?= $this->escape($instrument['isin']) ?></code>
                <?php endif; ?>
                · <?= $this->escape($instrument['currency'] ?? 'EUR') ?>
                <?php if (!empty($instrument['asset_class_name'])): ?>
                    · <span class="badge" style="background:<?= $this->escape($instrument['asset_class_color'] ?? '#6c757d') ?>"><?= $this->escape($instrument['asset_class_name']) ?></span>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-cash me-1"></i>Aggiorna quotazione</h2>
        <form id="price-update-form" class="row g-2">
            <?= $this->csrfField() ?>
            <input type="hidden" name="instrument_id" value="<?= (int) $instrument['id'] ?>">
            <div class="col-7">
                <label class="form-label small mb-1">Prezzo (<?= $this->escape($instrument['currency'] ?? 'EUR') ?>)</label>
                <input type="text" name="price" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="price_date" class="form-control" required value="<?= date('Y-m-d') ?>">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Salva
                </button>
            </div>
        </form>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-clock-history me-1"></i>Storico prezzi</h2>
        <div id="price-history">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-graph-up me-1"></i>Andamento</h2>
        <div style="height:280px"><canvas id="price-chart"></canvas></div>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-list-ul me-1"></i>Operazioni</h2>
        <div id="instrument-transactions">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</section>
</div>

<script>window.MX_INSTRUMENT_ID = <?= (int) $instrument['id'] ?>;</script>
<script type="module" src="<?= $this->asset('js/pages/security-instrument.js') ?>"></script>
<?php $this->endSection(); ?>
