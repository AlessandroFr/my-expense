<?php
/**
 * @var \App\Views\View $this
 */

$this->extends('layouts.app');
$this->section('content');

$base     = $this->baseUrl();
$username = (string) ($this->username ?? '');
?>
<div class="row justify-content-center">
    <div class="col-md-6 col-lg-5">
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <h1 class="h4 mb-3"><i class="bi bi-person-plus me-2"></i>Configurazione iniziale</h1>
                <p class="text-muted small mb-4">
                    Crea il tuo account. Questa pagina sarà disabilitata dopo la registrazione.
                </p>

                <form method="post" action="<?= $this->escape($base . '/setup') ?>" autocomplete="off">
                    <?= $this->csrfField() ?>
                    <div class="mb-3">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" class="form-control" id="username" name="username"
                               required maxlength="64"
                               value="<?= $this->escape($username) ?>" autofocus>
                    </div>
                    <div class="mb-3">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" class="form-control" id="password" name="password"
                               required minlength="8">
                        <div class="form-text">Almeno 8 caratteri.</div>
                    </div>
                    <div class="mb-4">
                        <label for="password_confirm" class="form-label">Conferma password</label>
                        <input type="password" class="form-control" id="password_confirm" name="password_confirm"
                               required minlength="8">
                    </div>
                    <button type="submit" class="btn btn-primary w-100">
                        <i class="bi bi-check-lg me-1"></i>Crea account
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>
<?php $this->endSection(); ?>
