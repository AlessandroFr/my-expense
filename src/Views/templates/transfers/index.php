<?php
/**
 * @var \App\Views\View $this
 *
 * Trasferimenti atomici fra conti.
 */

$this->extends('layouts.app');
$this->section('content');
?>
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-arrow-left-right me-2"></i>Trasferimenti</h1>
        <div class="text-muted small">
            Bonifici interni fra i tuoi conti. Non vengono conteggiati nei KPI mensili
            (spese/entrate restano pulite), ma il saldo dei conti coinvolti si muove.
        </div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Nuovo trasferimento</h2>
        <form id="transfer-create-form" class="row g-2">
            <?= $this->csrfField() ?>
            <div class="col-12">
                <label class="form-label small mb-1">Conto sorgente</label>
                <select name="source_account_id" class="form-select" required data-role="source">
                    <option value="">Seleziona…</option>
                </select>
            </div>
            <div class="col-12 text-center text-muted small py-1">
                <i class="bi bi-arrow-down"></i>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Conto destinazione</label>
                <select name="destination_account_id" class="form-select" required data-role="destination">
                    <option value="">Seleziona…</option>
                </select>
            </div>
            <div class="col-7">
                <label class="form-label small mb-1">Importo (EUR)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required placeholder="500,00">
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="transfer_date" class="form-control" required value="<?= date('Y-m-d') ?>">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Descrizione</label>
                <input type="text" name="description" class="form-control" maxlength="255" placeholder="Es: versamento broker">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Note (opzionali)</label>
                <input type="text" name="notes" class="form-control" maxlength="255">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-arrow-left-right me-1"></i>Crea trasferimento
                </button>
            </div>
        </form>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <div class="card-body">
        <div class="d-flex align-items-center mb-3 gap-2 flex-wrap">
            <h2 class="h6 mb-0 flex-grow-1"><i class="bi bi-clock-history me-1"></i>Storico</h2>
            <input type="date" id="transfers-filter-date-from" class="form-control form-control-sm" style="max-width:150px" title="Da">
            <input type="date" id="transfers-filter-date-to"   class="form-control form-control-sm" style="max-width:150px" title="A">
        </div>
        <div id="transfers-list">
            <div class="text-center text-muted py-4">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</section>
</div>

<script type="module" src="<?= $this->asset('js/pages/transfers.js') ?>"></script>
<?php $this->endSection(); ?>
