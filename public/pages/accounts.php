<?php
/**
 * Conti — gestione multi-conto (carte, contanti, risparmi) con saldi live.
 */

use App\Config;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
?>
<div class="row mb-3 align-items-center">
    <div class="col-md-8">
        <h1 class="h3 mb-0"><i class="bi bi-bank me-2"></i>Conti</h1>
        <div class="text-muted small">Carte, conti correnti, contanti, risparmi: tutti i tuoi salvadanai.</div>
    </div>
</div>

<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Nuovo conto</h2>
        <form id="account-create-form" class="row g-2 align-items-end">
            <div class="col-md-3">
                <label class="form-label small mb-1">Nome</label>
                <input type="text" name="name" class="form-control" required maxlength="64" placeholder="Es: Carta Hype, Cash">
            </div>
            <div class="col-md-2">
                <label class="form-label small mb-1">Tipo</label>
                <select name="type" class="form-select">
                    <option value="checking">Conto corrente</option>
                    <option value="card">Carta</option>
                    <option value="cash">Contanti</option>
                    <option value="savings">Risparmi</option>
                    <option value="other">Altro</option>
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label small mb-1">Saldo iniziale (EUR)</label>
                <input type="text" name="opening_balance" class="form-control" inputmode="decimal" value="0">
            </div>
            <div class="col-md-1">
                <label class="form-label small mb-1">Colore</label>
                <input type="color" name="color" class="form-control form-control-color" value="#0d6efd">
            </div>
            <div class="col-md-2">
                <label class="form-label small mb-1">Icona (Bootstrap)</label>
                <input type="text" name="icon" class="form-control" placeholder="credit-card">
            </div>
            <div class="col-md-2 d-grid">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Aggiungi
                </button>
            </div>
        </form>
    </div>
</div>

<div id="accounts-list" class="row g-3">
    <div class="col-12 text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento...
    </div>
</div>

<script type="module" src="<?= htmlspecialchars($base . '/js/pages/accounts.js', ENT_QUOTES, 'UTF-8') ?>"></script>
