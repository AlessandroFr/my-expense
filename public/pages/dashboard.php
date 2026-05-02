<?php
/**
 * Dashboard placeholder. Le funzionalità reali (CRUD spese, grafici, budget)
 * arrivano negli step successivi.
 */

use App\Auth;
?>
<div class="row">
    <div class="col-12">
        <h1 class="h3 mb-3">
            <i class="bi bi-speedometer2 me-2"></i>Dashboard
        </h1>
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <p class="lead mb-2">
                    Benvenuto, <strong><?= htmlspecialchars(Auth::username() ?? '', ENT_QUOTES, 'UTF-8') ?></strong>!
                </p>
                <p class="text-muted mb-0">
                    L'autenticazione è attiva. Le funzionalità di tracciamento spese
                    (categorie, voci di spesa, dashboard mensile) arriveranno nei
                    prossimi step.
                </p>
            </div>
        </div>
    </div>
</div>
