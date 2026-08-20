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
                <h1 class="h4 mb-3"><i class="bi bi-shield-lock me-2"></i>Reimposta password</h1>
                <p class="text-muted small mb-3">
                    Apri il file di recupero sulla macchina, copia il codice e
                    incollalo qui sotto insieme alla nuova password.
                </p>

                <div class="alert alert-info small d-flex align-items-start">
                    <i class="bi bi-file-earmark-text me-2 mt-1"></i>
                    <div>
                        <div class="fw-semibold mb-1">Codice salvato in</div>
                        <code class="user-select-all"><?= $this->escape($tokenFilePath) ?></code>
                    </div>
                </div>

                <form method="post" action="<?= $this->escape($base . '/password/reset') ?>" autocomplete="off">
                    <?= $this->csrfField() ?>
                    <div class="mb-3">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" class="form-control" id="username" name="username"
                               required maxlength="64"
                               value="<?= $this->escape($username) ?>">
                    </div>
                    <div class="mb-3">
                        <label for="token" class="form-label">Codice di recupero</label>
                        <input type="text" class="form-control font-monospace" id="token" name="token"
                               required maxlength="64" autocomplete="off"
                               placeholder="32 caratteri alfanumerici">
                    </div>
                    <div class="mb-3">
                        <label for="password" class="form-label">Nuova password</label>
                        <input type="password" class="form-control" id="password" name="password"
                               required minlength="8">
                        <div class="form-text">Almeno 8 caratteri.</div>
                    </div>
                    <div class="mb-4">
                        <label for="password_confirm" class="form-label">Conferma nuova password</label>
                        <input type="password" class="form-control" id="password_confirm" name="password_confirm"
                               required minlength="8">
                    </div>
                    <button type="submit" class="btn btn-primary w-100">
                        <i class="bi bi-check-lg me-1"></i>Imposta nuova password
                    </button>
                </form>

                <div class="d-flex justify-content-between mt-3 small">
                    <a href="<?= $this->escape($base . '/password/forgot') ?>" class="text-muted">
                        <i class="bi bi-arrow-clockwise me-1"></i>Richiedi un nuovo codice
                    </a>
                    <a href="<?= $this->escape($base . '/login') ?>" class="text-muted">
                        Torna al login<i class="bi bi-arrow-right ms-1"></i>
                    </a>
                </div>
            </div>
        </div>
    </div>
</div>
<?php $this->endSection(); ?>
