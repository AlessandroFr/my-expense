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
                    <option value="investment">Investimenti</option>
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

            <div class="col-12 mt-2">
                <details>
                    <summary class="small text-muted" style="cursor:pointer">
                        <i class="bi bi-bank2 me-1"></i>Dettagli bancari (opzionale)
                    </summary>
                    <div class="row g-2 mt-2">
                        <div class="col-md-4">
                            <label class="form-label small mb-1">IBAN</label>
                            <input type="text" name="iban" class="form-control" maxlength="40" placeholder="IT60 X054 2811 1010 0000 0123 456">
                        </div>
                        <div class="col-md-2">
                            <label class="form-label small mb-1">BIC / SWIFT</label>
                            <input type="text" name="bic" class="form-control" maxlength="11" placeholder="BPMOIT22XXX">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small mb-1">Banca / Broker</label>
                            <input type="text" name="bank_name" class="form-control" maxlength="128" placeholder="Banca Sella">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small mb-1">Intestatario</label>
                            <input type="text" name="account_holder" class="form-control" maxlength="128" placeholder="Mario Rossi">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small mb-1">N. conto / Dossier</label>
                            <input type="text" name="account_number" class="form-control" maxlength="64" placeholder="0000123456">
                        </div>
                        <div class="col-md-9">
                            <label class="form-label small mb-1">Note</label>
                            <input type="text" name="notes" class="form-control" maxlength="255" placeholder="Conto deposito titoli, ISIN, strategia...">
                        </div>
                    </div>
                </details>
            </div>
        </form>
    </div>
</div>

<div id="accounts-list" class="row g-3">
    <div class="col-12 text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento...
    </div>
</div>

<dialog id="account-edit-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 720px; width: 95%">
    <form id="account-edit-form" method="dialog" class="m-0">
        <div class="modal-content border-0">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-pencil-square me-2"></i>Modifica conto</h5>
                <button type="button" class="btn-close" data-edit-action="close" aria-label="Chiudi"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="id">
                <input type="hidden" name="archived" value="0">
                <input type="hidden" name="sort_order" value="0">
                <div class="row g-2">
                    <div class="col-md-5">
                        <label class="form-label small mb-1">Nome</label>
                        <input type="text" name="name" class="form-control" required maxlength="64">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Tipo</label>
                        <select name="type" class="form-select">
                            <option value="checking">Conto corrente</option>
                            <option value="card">Carta</option>
                            <option value="cash">Contanti</option>
                            <option value="savings">Risparmi</option>
                            <option value="investment">Investimenti</option>
                            <option value="other">Altro</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small mb-1">Saldo iniziale</label>
                        <input type="text" name="opening_balance" class="form-control" inputmode="decimal">
                    </div>
                    <div class="col-md-1">
                        <label class="form-label small mb-1">Col.</label>
                        <input type="color" name="color" class="form-control form-control-color">
                    </div>
                    <div class="col-md-1">
                        <label class="form-label small mb-1">Icona</label>
                        <input type="text" name="icon" class="form-control" maxlength="32" placeholder="bank">
                    </div>

                    <div class="col-12"><hr class="my-2"></div>
                    <div class="col-12">
                        <div class="small text-muted mb-1"><i class="bi bi-bank2 me-1"></i>Dettagli bancari</div>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">IBAN</label>
                        <input type="text" name="iban" class="form-control" maxlength="40">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">BIC / SWIFT</label>
                        <input type="text" name="bic" class="form-control" maxlength="11">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Banca / Broker</label>
                        <input type="text" name="bank_name" class="form-control" maxlength="128">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small mb-1">Intestatario</label>
                        <input type="text" name="account_holder" class="form-control" maxlength="128">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small mb-1">N. conto / Dossier</label>
                        <input type="text" name="account_number" class="form-control" maxlength="64">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small mb-1">Note</label>
                        <input type="text" name="notes" class="form-control" maxlength="255">
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-edit-action="close">Annulla</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-circle me-1"></i>Salva</button>
            </div>
        </div>
    </form>
</dialog>

<script type="module" src="<?= htmlspecialchars($base . '/js/pages/accounts.js', ENT_QUOTES, 'UTF-8') ?>"></script>
