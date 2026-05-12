<?php
/**
 * @var \App\Views\View $this
 */

$this->extends('layouts.app');
$this->section('content');

$base          = $this->baseUrl();
$username      = (string) ($this->username ?? '');
$tokenFilePath = (string) ($this->tokenFilePath ?? '');
?>
<div class="row justify-content-center">
    <div class="col-md-7 col-lg-6">
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <h1 class="h4 mb-3"><i class="bi bi-key me-2"></i>Password dimenticata</h1>
                <p class="text-muted small mb-4">
                    Inserisci il tuo username. Verra' generato un codice di recupero
                    monouso che troverai sul disco di questa macchina (nel file
                    indicato qui sotto). Apri il file, copia il codice e incollalo
                    nella pagina successiva insieme alla nuova password.
                </p>

                <div class="alert alert-info small d-flex align-items-start">
                    <i class="bi bi-info-circle me-2 mt-1"></i>
                    <div>
                        <div class="fw-semibold mb-1">Percorso del file</div>
                        <code class="user-select-all"><?= $this->escape($tokenFilePath) ?></code>
                        <div class="mt-1 text-muted">Validita' del codice: 15 minuti.</div>
                    </div>
                </div>

                <form method="post" action="<?= $this->escape($base . '/password/forgot') ?>" autocomplete="off">
                    <?= $this->csrfField() ?>
                    <div class="mb-4">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" class="form-control" id="username" name="username"
                               required maxlength="64"
                               value="<?= $this->escape($username) ?>" autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">
                        <i class="bi bi-send me-1"></i>Genera codice di recupero
                    </button>
                </form>

                <div class="text-center mt-3">
                    <a href="<?= $this->escape($base . '/login') ?>" class="small text-muted">
                        <i class="bi bi-arrow-left me-1"></i>Torna al login
                    </a>
                </div>
            </div>
        </div>
    </div>
</div>
<?php $this->endSection(); ?>
