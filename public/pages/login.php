<?php
/**
 * Pagina login.
 */

use App\Config;
use App\Csrf;
use App\Session;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
$old  = Session::get('_old', []);
Session::forget('_old');
$username = is_array($old) ? (string) ($old['username'] ?? '') : '';
?>
<div class="row justify-content-center">
    <div class="col-md-5 col-lg-4">
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <h1 class="h4 mb-4 text-center">
                    <i class="bi bi-wallet2 me-2"></i>My Expense
                </h1>

                <form method="post" action="<?= htmlspecialchars($base . '/login', ENT_QUOTES, 'UTF-8') ?>" autocomplete="off">
                    <?= Csrf::field() ?>

                    <div class="mb-3">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" class="form-control" id="username" name="username"
                               required maxlength="64"
                               value="<?= htmlspecialchars($username, ENT_QUOTES, 'UTF-8') ?>" autofocus>
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
