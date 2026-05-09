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
    <div class="col-md-5 col-lg-4">
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <h1 class="h4 mb-4 text-center">
                    <i class="bi bi-wallet2 me-2"></i>My Expense
                </h1>
                <form method="post" action="<?= $this->escape($base . '/login') ?>" autocomplete="off">
                    <?= $this->csrfField() ?>
                    <div class="mb-3">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" class="form-control" id="username" name="username"
                               required maxlength="64"
                               value="<?= $this->escape($username) ?>" autofocus>
                    </div>
                    <div class="mb-4">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" class="form-control" id="password" name="password" required>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">
                        <i class="bi bi-box-arrow-in-right me-1"></i>Accedi
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>
<?php $this->endSection(); ?>
