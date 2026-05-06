<?php
/**
 * Pagina modifica categoria.
 * Variabile in scope: $id (int) — passata da public/index.php tramite $data.
 */

use App\Auth;
use App\Category;
use App\Config;
use App\Csrf;
use App\Session;

$base   = rtrim(Config::get('app')['base_url'] ?? '', '/');
$userId = (int) Auth::userId();
$cat    = Category::findForUser((int) ($id ?? 0), $userId);

if ($cat === null) {
    echo '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Categoria non trovata.</div>';
    echo '<a href="' . htmlspecialchars($base . '/categories', ENT_QUOTES, 'UTF-8') . '" class="btn btn-secondary">← Torna alle categorie</a>';
    return;
}

$old = Session::get('_old', []);
Session::forget('_old');
$old = is_array($old) ? $old : [];
$values = $old + $cat;
?>
<div class="row mb-3">
    <div class="col-12 d-flex align-items-center">
        <a href="<?= htmlspecialchars($base . '/categories', ENT_QUOTES, 'UTF-8') ?>" class="btn btn-sm btn-outline-secondary me-3">
            <i class="bi bi-arrow-left"></i>
        </a>
        <h1 class="h3 mb-0"><i class="bi bi-pencil me-2"></i>Modifica categoria</h1>
    </div>
</div>

<div class="row justify-content-center">
    <div class="col-lg-8">
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <form id="category-update-form" autocomplete="off">
                    <?= Csrf::field() ?>
                    <input type="hidden" name="id" value="<?= (int) $cat['id'] ?>">

                    <div class="row g-3">
                        <div class="col-md-6">
                            <label for="name" class="form-label">Nome</label>
                            <input type="text" id="name" name="name" class="form-control"
                                   required maxlength="64"
                                   value="<?= htmlspecialchars((string) $values['name'], ENT_QUOTES, 'UTF-8') ?>" autofocus>
                        </div>
                        <div class="col-md-3">
                            <label for="color" class="form-label">Colore</label>
                            <input type="color" id="color" name="color" class="form-control form-control-color"
                                   value="<?= htmlspecialchars((string) $values['color'], ENT_QUOTES, 'UTF-8') ?>">
                        </div>
                        <div class="col-md-3">
                            <label for="sort_order" class="form-label">Ordine</label>
                            <input type="number" id="sort_order" name="sort_order" class="form-control"
                                   value="<?= htmlspecialchars((string) $values['sort_order'], ENT_QUOTES, 'UTF-8') ?>">
                        </div>
                        <div class="col-12">
                            <label for="icon" class="form-label">Icona <span class="text-muted small">(opzionale)</span></label>
                            <input type="text" id="icon" name="icon" class="form-control"
                                   maxlength="32"
                                   value="<?= htmlspecialchars((string) ($values['icon'] ?? ''), ENT_QUOTES, 'UTF-8') ?>"
                                   placeholder="Sfoglia con il bottone…"
                                   data-icon-picker>
                        </div>
                    </div>

                    <hr class="my-4">

                    <div class="d-flex justify-content-between">
                        <a href="<?= htmlspecialchars($base . '/categories', ENT_QUOTES, 'UTF-8') ?>" class="btn btn-outline-secondary">
                            Annulla
                        </a>
                        <button type="submit" class="btn btn-primary">
                            <i class="bi bi-check-lg me-1"></i>Salva modifiche
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script type="module" src="<?= $asset('js/pages/categories.js') ?>"></script>
