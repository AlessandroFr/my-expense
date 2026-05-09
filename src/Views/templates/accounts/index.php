<?php
/**
 * @var \App\Views\View $this
 *
 * Conti -- migrato da public/pages/accounts.php.
 */

$this->extends('layouts.app');
$this->section('content');
?>
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-bank me-2"></i>Conti</h1>
        <div class="text-muted small">Carte, conti correnti, contanti, risparmi: tutti i tuoi salvadanai.</div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Nuovo conto</h2>
        <form id="account-create-form" class="row g-2 align-items-end">
            <?= $this->csrfField() ?>
            <div class="col-12">
                <label class="form-label small mb-1">Nome</label>
                <input type="text" name="name" class="form-control" required maxlength="64" placeholder="Es: Carta Hype, Cash">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Tipo</label>
                <select name="type" class="form-select">
                    <option value="checking">Conto corrente</option>
                    <option value="card">Carta</option>
                    <option value="cash">Contanti</option>
                    <option value="savings">Risparmi</option>
                    <option value="investment">Investimenti</option>
                    <option value="deposit">Deposito titoli</option>
                    <option value="pac">Piano accumulo (PAC)</option>
                    <option value="other">Altro</option>
                </select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Saldo iniziale (EUR)</label>
                <input type="text" name="opening_balance" class="form-control" inputmode="decimal" value="0">
            </div>
            <div class="col-12" data-cash-only style="display:none">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" name="is_default_cash" id="account-create-is-default-cash" value="1">
                    <label class="form-check-label small" for="account-create-is-default-cash">
                        <i class="bi bi-wallet2 me-1"></i>Conto cassa principale
                        <span class="text-muted">(riceve i prelievi ATM e i pagamenti contanti)</span>
                    </label>
                </div>
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Colore</label>
                <input type="color" name="color" class="form-control form-control-color" value="#0d6efd">
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Icona</label>
                <input type="text" name="icon" class="form-control" placeholder="Sfoglia…" data-icon-picker>
            </div>

            <div class="col-12 mt-2">
                <details>
                    <summary class="small text-muted" style="cursor:pointer">
                        <i class="bi bi-bank2 me-1"></i>Dettagli bancari (opzionale)
                    </summary>
                    <div class="row g-2 mt-2">
                        <div class="col-12">
                            <label class="form-label small mb-1">IBAN</label>
                            <input type="text" name="iban" class="form-control" maxlength="40" placeholder="IT60 X054 2811 1010 0000 0123 456">
                        </div>
                        <div class="col-6">
                            <label class="form-label small mb-1">BIC / SWIFT</label>
                            <input type="text" name="bic" class="form-control" maxlength="11" placeholder="BPMOIT22XXX">
                        </div>
                        <div class="col-6">
                            <label class="form-label small mb-1">Banca / Broker</label>
                            <input type="text" name="bank_name" class="form-control" maxlength="128" placeholder="Banca Sella">
                        </div>
                        <div class="col-12">
                            <label class="form-label small mb-1">Intestatario</label>
                            <input type="text" name="account_holder" class="form-control" maxlength="128" placeholder="Mario Rossi">
                        </div>
                        <div class="col-12">
                            <label class="form-label small mb-1">N. conto / Dossier</label>
                            <input type="text" name="account_number" class="form-control" maxlength="64" placeholder="0000123456">
                        </div>
                        <div class="col-12">
                            <label class="form-label small mb-1">Note</label>
                            <input type="text" name="notes" class="form-control" maxlength="255" placeholder="Conto deposito titoli, ISIN, strategia...">
                        </div>
                    </div>
                </details>
            </div>

            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Aggiungi
                </button>
            </div>
        </form>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div id="accounts-list" class="row g-3">
    <div class="col-12 text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento...
    </div>
</div>
</section>
</div>

<dialog id="account-edit-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 720px; width: 95%">
    <form id="account-edit-form" method="dialog" class="m-0">
        <?= $this->csrfField() ?>
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
                    <div class="col-md-4">
                        <label class="form-label small mb-1">Nome</label>
                        <input type="text" name="name" class="form-control" required maxlength="64">
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
                        <label class="form-label small mb-1">Saldo iniziale</label>
                        <input type="text" name="opening_balance" class="form-control" inputmode="decimal">
                    </div>
                    <div class="col-md-1">
                        <label class="form-label small mb-1">Col.</label>
                        <input type="color" name="color" class="form-control form-control-color">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Icona</label>
                        <input type="text" name="icon" class="form-control" maxlength="32" placeholder="Sfoglia…" data-icon-picker>
                    </div>
                    <div class="col-12" data-cash-only style="display:none">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" name="is_default_cash" id="account-edit-is-default-cash" value="1">
                            <label class="form-check-label small" for="account-edit-is-default-cash">
                                <i class="bi bi-wallet2 me-1"></i>Conto cassa principale
                            </label>
                        </div>
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

<dialog id="account-reconcile-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 720px; width: 95%">
    <div class="modal-content border-0">
        <div class="modal-header">
            <h5 class="modal-title">
                <i class="bi bi-check2-circle me-2"></i>Riconcilia conto
                <span id="reconcile-account-name" class="text-muted fw-normal"></span>
            </h5>
            <button type="button" class="btn-close" data-recon-action="close" aria-label="Chiudi"></button>
        </div>
        <div class="modal-body">
            <p class="small text-muted mb-3">
                Allinea il saldo del conto alla realtà dichiarando il valore reale a una certa data.
                Il sistema genera automaticamente un movimento di rettifica per coprire la differenza.
            </p>

            <form id="account-reconcile-form" class="row g-2">
                <?= $this->csrfField() ?>
                <input type="hidden" name="account_id" value="">

                <div class="col-md-6">
                    <label class="form-label small mb-1">Saldo calcolato dal sistema</label>
                    <input type="text" id="reconcile-calculated" class="form-control" readonly>
                </div>
                <div class="col-md-6">
                    <label class="form-label small mb-1">Saldo reale dichiarato (EUR)</label>
                    <input type="text" name="declared_balance" class="form-control"
                           inputmode="decimal" required placeholder="Es: 1234,56">
                </div>

                <div class="col-md-6">
                    <label class="form-label small mb-1">Data riconciliazione</label>
                    <input type="date" name="reconciled_at" class="form-control" required>
                </div>
                <div class="col-md-6">
                    <label class="form-label small mb-1">Note (opzionali)</label>
                    <input type="text" name="notes" class="form-control" maxlength="255">
                </div>

                <div class="col-12">
                    <div id="reconcile-preview" class="alert alert-secondary small mb-0 py-2">
                        Inserisci il saldo reale per vedere la differenza.
                    </div>
                </div>

                <div class="col-12 d-flex justify-content-end gap-2 mt-2">
                    <button type="button" class="btn btn-secondary" data-recon-action="close">Annulla</button>
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-check2-circle me-1"></i>Riconcilia
                    </button>
                </div>
            </form>

            <hr class="my-3">

            <h6 class="mb-2"><i class="bi bi-clock-history me-1"></i>Storico riconciliazioni</h6>
            <div id="account-reconcile-history" class="small">
                <div class="text-muted">Caricamento...</div>
            </div>
        </div>
    </div>
</dialog>

<script type="module" src="<?= $this->asset('js/pages/accounts.js') ?>"></script>
<?php $this->endSection(); ?>
