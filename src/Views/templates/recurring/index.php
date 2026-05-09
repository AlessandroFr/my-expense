<?php
/**
 * @var \App\Views\View $this
 *
 * Spese ricorrenti -- migrato da public/pages/recurring.php.
 */

$this->extends('layouts.app');
$this->section('content');

$contacts = $this->contacts ?? [];
$today    = (string) ($this->today ?? date('Y-m-d'));
?>
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-arrow-repeat me-2"></i>Spese ricorrenti</h1>
        <div class="text-muted small">Affitti, abbonamenti, bollette: vengono generate automaticamente.</div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Nuova ricorrenza</h2>
        <form id="recurring-create-form" class="row g-2 align-items-end">
            <?= $this->csrfField() ?>
            <div class="col-6">
                <label class="form-label small mb-1">Inizio</label>
                <input type="date" name="start_date" class="form-control" value="<?= $this->escape($today) ?>" required>
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Fine (opz)</label>
                <input type="date" name="end_date" class="form-control">
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Frequenza</label>
                <select name="frequency" class="form-select" required>
                    <option value="monthly">Mensile</option>
                    <option value="weekly">Settimanale</option>
                    <option value="yearly">Annuale</option>
                </select>
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Categoria</label>
                <select name="category_id" class="form-select"></select>
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Importo (EUR)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Pagamento</label>
                <select name="payment_method" class="form-select">
                    <option value="card">Carta</option>
                    <option value="cash">Contanti</option>
                    <option value="transfer">Bonifico</option>
                    <option value="other">Altro</option>
                </select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Fornitore <span class="text-muted">(opz., crea al volo)</span></label>
                <input type="text" name="contact_name" class="form-control" list="contacts-datalist" maxlength="120" placeholder="es. Netflix, Vodafone">
                <datalist id="contacts-datalist">
                    <?php foreach ($contacts as $cn): ?>
                        <option value="<?= $this->escape((string) $cn['name']) ?>"></option>
                    <?php endforeach; ?>
                </datalist>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Descrizione</label>
                <input type="text" name="description" class="form-control" maxlength="512" placeholder="Es: Affitto, Netflix, Assicurazione auto">
            </div>
            <div class="col-12 d-grid">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Aggiungi
                </button>
            </div>
            <div class="col-12 d-grid">
                <button type="button" class="btn btn-outline-primary" id="btn-run-now">
                    <i class="bi bi-play-circle me-1"></i>Genera ora
                </button>
            </div>
        </form>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
            <thead class="table-light">
                <tr>
                    <th>Descrizione</th>
                    <th>Categoria</th>
                    <th>Frequenza</th>
                    <th>Inizio</th>
                    <th>Fine</th>
                    <th>Ultima gen.</th>
                    <th class="text-end">Importo</th>
                    <th>Stato</th>
                    <th></th>
                </tr>
            </thead>
            <tbody id="recurring-tbody">
                <tr><td colspan="9" class="text-center text-muted py-4">
                    <div class="spinner-border spinner-border-sm me-2"></div>Caricamento...
                </td></tr>
            </tbody>
        </table>
    </div>
</div>
</section>
</div>

<script type="module" src="<?= $this->asset('js/pages/recurring.js') ?>"></script>
<?php $this->endSection(); ?>
