<?php
/**
 * Pagina lista spese — AJAX via FetchRequest.
 * La tabella e il totale sono popolati lato client da public/js/pages/expenses.js.
 */

use App\Account;
use App\Auth;
use App\Category;
use App\Config;
use App\Contact;
use App\Csrf;
use App\Expense;

$base       = rtrim(Config::get('app')['base_url'] ?? '', '/');
$userId     = (int) Auth::userId();
$categories = Category::allForUser($userId);
$accounts    = Account::allForUser($userId, false);
$defaultCash = Account::defaultCashFor($userId);
$contacts    = Contact::allForUser($userId, false, 'supplier');
$today       = date('Y-m-d');
$paymentMethods = Expense::PAYMENT_METHODS;
$paymentLabels  = [
    'cash'     => 'Contanti',
    'card'     => 'Carta',
    'transfer' => 'Bonifico',
    'other'    => 'Altro',
];
?>
<div class="row mb-3 align-items-center">
    <div class="col-md-6">
        <h1 class="h3 mb-0"><i class="bi bi-receipt me-2"></i>Spese</h1>
    </div>
    <div class="col-md-6 text-md-end">
        <span class="text-muted small">Totale filtrato: </span>
        <span id="expenses-total" class="fw-semibold fs-5">EUR 0,00</span>
        <span class="text-muted small ms-2" id="expenses-count">(0 voci)</span>
    </div>
</div>

<!-- ── Modal: import CSV ──────────────────────────────────────────────────── -->
<div class="modal fade" id="csv-import-modal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <form id="csv-import-form" enctype="multipart/form-data">
                <?= Csrf::field() ?>
                <div class="modal-header">
                    <h5 class="modal-title"><i class="bi bi-upload me-1"></i>Importa spese da CSV</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-muted mb-2">
                        Formato accettato: header <code>Data;Categoria;Descrizione;Importo;Pagamento</code>
                        (separatore <code>;</code> o <code>,</code>). Data <code>YYYY-MM-DD</code> o <code>DD/MM/YYYY</code>.
                    </p>
                    <input type="file" name="file" accept=".csv" class="form-control mb-2" required>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="create-missing-cats" name="create_missing_categories" value="1" checked>
                        <label class="form-check-label small" for="create-missing-cats">
                            Crea automaticamente le categorie mancanti
                        </label>
                    </div>
                    <div id="csv-import-result" class="mt-3"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Chiudi</button>
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-upload me-1"></i>Importa
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- ── Modal: import estratto conto bancario (wizard preview + commit) ────── -->
<div class="modal fade" id="bank-import-modal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-bank me-1"></i>Importa estratto conto bancario</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
            </div>

            <!-- Step 1: upload + opzioni -->
            <form id="bank-import-form" enctype="multipart/form-data" action="javascript:void(0)" method="post" onsubmit="return false">
                <?= Csrf::field() ?>
                <div class="modal-body" id="bank-import-step1">
                    <p class="small text-muted mb-2">
                        Formato Banca Sella / Patavina (header
                        <code>Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate</code>,
                        encoding Windows-1252, date <code>DD/MM/YYYY</code>).
                        Le righe in <strong>Uscite</strong> diventano spese, quelle in <strong>Entrate</strong> diventano entrate.
                    </p>
                    <div class="mb-2">
                        <label class="form-label small fw-semibold">Conto su cui importare</label>
                        <?php if (empty($accounts)): ?>
                            <div class="alert alert-warning small mb-0">
                                Nessun conto attivo. <a href="<?= htmlspecialchars($base . '/accounts', ENT_QUOTES, 'UTF-8') ?>">Crea prima un conto</a>.
                            </div>
                        <?php else: ?>
                            <select name="account_id" class="form-select" required>
                                <option value="">— Seleziona conto —</option>
                                <?php foreach ($accounts as $a): ?>
                                    <option value="<?= (int) $a['id'] ?>"><?= htmlspecialchars((string) $a['name'], ENT_QUOTES, 'UTF-8') ?> (<?= htmlspecialchars((string) $a['type'], ENT_QUOTES, 'UTF-8') ?>)</option>
                                <?php endforeach; ?>
                            </select>
                        <?php endif; ?>
                    </div>
                    <input type="file" name="file" accept=".csv" class="form-control mb-2" required>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="bank-pair-ricariche" name="auto_pair_ricariche" value="1" checked>
                        <label class="form-check-label small" for="bank-pair-ricariche">
                            Partita doppia per ricariche carta prepagata
                            <span class="text-muted">(crea spesa sul conto + entrata su account "Carta Prepagata")</span>
                        </label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="bank-pair-prelievi" name="auto_pair_prelievi" value="1" checked>
                        <label class="form-check-label small" for="bank-pair-prelievi">
                            Partita doppia per prelievi ATM
                            <span class="text-muted">(crea spesa sul conto + entrata su "In tasca")</span>
                        </label>
                    </div>
                    <p class="small text-muted mt-2 mb-0">
                        Dopo l'analisi del file potrai rivedere e modificare ogni riga prima di confermare l'import.
                    </p>
                    <div id="bank-step1-status" class="small mt-2" role="status" aria-live="polite"></div>
                </div>
                <div class="modal-footer" id="bank-step1-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Chiudi</button>
                    <button type="button" id="bank-preview-btn" class="btn btn-primary" <?= empty($accounts) ? 'disabled' : '' ?>>
                        <i class="bi bi-search me-1"></i>Anteprima
                    </button>
                </div>
            </form>

            <!-- Step 2: tabella editabile + commit -->
            <div id="bank-import-step2" class="d-none">
                <div class="modal-body">
                    <div id="bank-preview-summary" class="mb-2"></div>

                    <!-- Toolbar: nuova categoria inline -->
                    <div class="d-flex flex-wrap align-items-center gap-2 mb-2 p-2 border rounded bg-light">
                        <strong class="small">Categorie</strong>
                        <input type="text" id="bank-new-category-name" class="form-control form-control-sm" placeholder="Nome nuova categoria" style="max-width:220px">
                        <input type="color" id="bank-new-category-color" class="form-control form-control-color form-control-sm" value="#6c757d" title="Colore">
                        <button type="button" id="bank-new-category-btn" class="btn btn-sm btn-outline-success">
                            <i class="bi bi-plus-circle me-1"></i>Crea categoria
                        </button>
                        <span class="text-muted small ms-auto">
                            Suggerimento: deseleziona "Importa" per saltare una riga.
                        </span>
                    </div>

                    <div class="d-flex align-items-center gap-2 mb-2">
                        <label class="form-check-label small mb-0 d-flex align-items-center gap-1">
                            <input type="checkbox" id="bank-toggle-all" class="form-check-input" checked>
                            Seleziona / deseleziona tutte
                        </label>
                        <span class="text-muted small ms-auto">Modifica i campi inline; conferma in fondo.</span>
                    </div>
                    <div id="bank-preview-list" class="d-flex flex-column gap-2 px-1" style="max-height:60vh; overflow-y:auto"></div>

                    <nav id="bank-preview-pager" class="d-flex justify-content-between align-items-center mt-2 small">
                        <div class="text-muted" id="bank-preview-pager-info"></div>
                        <ul class="pagination pagination-sm mb-0" id="bank-preview-pager-list"></ul>
                    </nav>

                    <div id="bank-parse-errors" class="mt-2"></div>
                    <div id="bank-import-result" class="mt-2"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-link me-auto" id="bank-back-btn">
                        <i class="bi bi-arrow-left me-1"></i>Indietro
                    </button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annulla</button>
                    <button type="button" class="btn btn-primary" id="bank-commit-btn">
                        <i class="bi bi-check-circle me-1"></i>Conferma import
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">

<!-- ── Aside con tabs ───────────────────────────────────────────────────── -->
<div class="card shadow-sm">
    <ul class="nav nav-fill mx-aside-tabs" id="expenses-aside-tabs" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link active" id="tab-new-tab" data-bs-toggle="tab" data-bs-target="#tab-new" type="button" role="tab" aria-controls="tab-new" aria-selected="true" title="Nuova spesa">
                <i class="bi bi-plus-circle"></i><span class="mx-tab-label">Nuova</span>
            </button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="tab-filters-tab" data-bs-toggle="tab" data-bs-target="#tab-filters" type="button" role="tab" aria-controls="tab-filters" aria-selected="false" title="Filtri">
                <i class="bi bi-funnel"></i><span class="mx-tab-label">Filtri</span>
            </button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="tab-tools-tab" data-bs-toggle="tab" data-bs-target="#tab-tools" type="button" role="tab" aria-controls="tab-tools" aria-selected="false" title="Strumenti">
                <i class="bi bi-tools"></i><span class="mx-tab-label">Strumenti</span>
            </button>
        </li>
    </ul>
    <div class="card-body">
        <div class="tab-content">

            <!-- ── Tab: Nuova spesa ─────────────────────────────────────── -->
            <div class="tab-pane fade show active" id="tab-new" role="tabpanel" aria-labelledby="tab-new-tab">
                <form id="expense-create-form" class="row g-2 align-items-end" autocomplete="off"
                      data-default-cash-id="<?= $defaultCash !== null ? (int) $defaultCash['id'] : '' ?>">
                    <?= Csrf::field() ?>
                    <div class="col-6">
                        <label class="form-label small">Data</label>
                        <input type="date" name="expense_date" class="form-control" required value="<?= htmlspecialchars($today, ENT_QUOTES, 'UTF-8') ?>">
                    </div>
                    <div class="col-6">
                        <label class="form-label small">Importo €</label>
                        <input type="number" step="0.01" min="0.01" name="amount" class="form-control" required placeholder="0,00">
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Categoria</label>
                        <select name="category_id" class="form-select">
                            <option value="">— Nessuna —</option>
                            <?php foreach ($categories as $c): ?>
                                <option value="<?= (int) $c['id'] ?>"><?= htmlspecialchars((string) $c['name'], ENT_QUOTES, 'UTF-8') ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-6">
                        <label class="form-label small">Pagamento</label>
                        <select name="payment_method" class="form-select" required>
                            <?php foreach ($paymentMethods as $pm): ?>
                                <option value="<?= htmlspecialchars($pm, ENT_QUOTES, 'UTF-8') ?>" <?= $pm === 'card' ? 'selected' : '' ?>>
                                    <?= htmlspecialchars($paymentLabels[$pm] ?? $pm, ENT_QUOTES, 'UTF-8') ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-6">
                        <label class="form-label small">Conto <span class="text-muted">(opz.)</span></label>
                        <select name="account_id" class="form-select">
                            <option value="">— Nessuno —</option>
                            <?php foreach ($accounts as $a): ?>
                                <option value="<?= (int) $a['id'] ?>" data-type="<?= htmlspecialchars((string) $a['type'], ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars((string) $a['name'], ENT_QUOTES, 'UTF-8') ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Descrizione <span class="text-muted">(opz.)</span></label>
                        <textarea id="expense-create-description" name="description" class="form-control mx-rich-editor" rows="3" maxlength="2048" placeholder="es. Pranzo bar"></textarea>
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Fornitore <span class="text-muted">(opz., crea al volo)</span></label>
                        <input type="text" name="contact_name" class="form-control" list="contacts-datalist" maxlength="120" placeholder="es. Esselunga, Enel Energia">
                        <datalist id="contacts-datalist">
                            <?php foreach ($contacts as $cn): ?>
                                <option value="<?= htmlspecialchars((string) $cn['name'], ENT_QUOTES, 'UTF-8') ?>"></option>
                            <?php endforeach; ?>
                        </datalist>
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Tag <span class="text-muted">(separati da virgola, opz.)</span></label>
                        <input type="text" name="tags" class="form-control" list="all-tags-datalist" placeholder="lavoro, ufficio, urgente">
                        <datalist id="all-tags-datalist"></datalist>
                    </div>
                    <div class="col-7">
                        <label class="form-label small">Condivisa con <span class="text-muted">(opz.)</span></label>
                        <input type="text" name="shared_with" class="form-control" maxlength="255" placeholder="Marco, Luca">
                    </div>
                    <div class="col-5">
                        <label class="form-label small">Tua quota €</label>
                        <input type="number" step="0.01" min="0.01" name="share_amount" class="form-control" placeholder="0,00">
                    </div>
                    <div class="col-12 d-grid">
                        <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Aggiungi spesa</button>
                    </div>
                    <div class="col-12">
                        <label class="btn btn-sm btn-outline-secondary mb-0 w-100">
                            <i class="bi bi-camera me-1"></i>Scansiona scontrino (OCR)
                            <input type="file" id="ocr-input" accept="image/*" capture="environment" hidden>
                        </label>
                        <span id="ocr-status" class="small text-muted ms-2"></span>
                    </div>
                </form>
            </div>

            <!-- ── Tab: Filtri ──────────────────────────────────────────── -->
            <div class="tab-pane fade" id="tab-filters" role="tabpanel" aria-labelledby="tab-filters-tab">
                <form id="expenses-filters" class="row g-2 align-items-end">
                    <div class="col-6">
                        <label class="form-label small">Da</label>
                        <input type="date" name="date_from" class="form-control form-control-sm">
                    </div>
                    <div class="col-6">
                        <label class="form-label small">A</label>
                        <input type="date" name="date_to" class="form-control form-control-sm">
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Categoria</label>
                        <select name="category_id" class="form-select form-select-sm">
                            <option value="">Tutte</option>
                            <?php foreach ($categories as $c): ?>
                                <option value="<?= (int) $c['id'] ?>"><?= htmlspecialchars((string) $c['name'], ENT_QUOTES, 'UTF-8') ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Conto</label>
                        <select name="account_id" class="form-select form-select-sm">
                            <option value="">Tutti</option>
                            <?php foreach ($accounts as $a): ?>
                                <option value="<?= (int) $a['id'] ?>"><?= htmlspecialchars((string) $a['name'], ENT_QUOTES, 'UTF-8') ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Fornitore</label>
                        <select name="contact_id" class="form-select form-select-sm">
                            <option value="">Tutti</option>
                            <?php foreach ($contacts as $cn): ?>
                                <option value="<?= (int) $cn['id'] ?>"><?= htmlspecialchars((string) $cn['name'], ENT_QUOTES, 'UTF-8') ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-6">
                        <label class="form-label small">Min €</label>
                        <input type="number" step="0.01" min="0" name="amount_min" class="form-control form-control-sm">
                    </div>
                    <div class="col-6">
                        <label class="form-label small">Max €</label>
                        <input type="number" step="0.01" min="0" name="amount_max" class="form-control form-control-sm">
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Cerca</label>
                        <input type="text" name="search" class="form-control form-control-sm" placeholder="descrizione…">
                    </div>
                    <div class="col-12">
                        <label class="form-label small">Tag</label>
                        <select name="tag" class="form-select form-select-sm" id="filter-tag">
                            <option value="">Tutti</option>
                        </select>
                    </div>
                    <div class="col-12 d-grid">
                        <button type="button" id="filters-reset" class="btn btn-sm btn-outline-secondary" title="Resetta filtri">
                            <i class="bi bi-x-lg me-1"></i>Reset filtri
                        </button>
                    </div>
                </form>
            </div>

            <!-- ── Tab: Strumenti ───────────────────────────────────────── -->
            <div class="tab-pane fade" id="tab-tools" role="tabpanel" aria-labelledby="tab-tools-tab">
                <div class="d-grid gap-2">
                    <div class="dropdown">
                        <button type="button" class="btn btn-outline-secondary w-100 dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" title="Filtri salvati">
                            <i class="bi bi-bookmark me-1"></i>Filtri salvati
                        </button>
                        <ul class="dropdown-menu w-100" id="saved-filters-menu">
                            <li><a class="dropdown-item small" href="#" data-saved-action="save"><i class="bi bi-floppy me-1"></i>Salva filtro corrente...</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><span class="dropdown-item-text small text-muted">Nessun filtro salvato.</span></li>
                        </ul>
                    </div>
                    <button type="button" class="btn btn-outline-secondary" id="btn-export-csv" title="Scarica CSV con i filtri attivi">
                        <i class="bi bi-download me-1"></i>Esporta CSV
                    </button>
                    <button type="button" class="btn btn-outline-secondary" id="btn-import-csv" data-bs-toggle="modal" data-bs-target="#csv-import-modal" title="Importa CSV semplice">
                        <i class="bi bi-upload me-1"></i>Importa CSV
                    </button>
                    <button type="button" class="btn btn-outline-secondary" id="btn-import-bank" data-bs-toggle="modal" data-bs-target="#bank-import-modal" title="Importa estratto conto bancario">
                        <i class="bi bi-bank me-1"></i>Estratto conto bancario
                    </button>
                </div>
            </div>

        </div>
    </div>
</div>

</aside>

<section class="col-12 col-lg-7 col-xl-8">
<!-- ── Tabella spese ─────────────────────────────────────────────────────── -->
<div class="card shadow-sm">
    <div class="card-body p-0">
        <nav id="expenses-pager" class="px-3 pt-2"></nav>
        <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
                <thead class="table-light">
                    <tr>
                        <th style="width:1%"></th>
                        <th class="text-nowrap">Data</th>
                        <th>Conto</th>
                        <th class="text-nowrap">Categoria</th>
                        <th>Descrizione</th>
                        <th class="text-center" style="width:1%" title="Tag">#</th>
                        <th class="text-center" style="width:1%" title="Pagamento"><i class="bi bi-credit-card"></i></th>
                        <th class="text-end text-nowrap">Importo</th>
                        <th class="text-end" style="width:1%">Azioni</th>
                    </tr>
                </thead>
                <tbody id="expenses-tbody">
                    <tr id="expenses-loading">
                        <td colspan="9" class="text-center text-muted py-4">
                            <span class="spinner-border spinner-border-sm me-2"></span>Carico…
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
</section>
</div>

<!-- ── Modal: edit spesa ─────────────────────────────────────────────────── -->
<div class="modal fade" id="expense-edit-modal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
            <form id="expense-edit-form" autocomplete="off">
                <?= Csrf::field() ?>
                <input type="hidden" name="id" value="">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="bi bi-pencil-square me-1"></i>Modifica spesa</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
                </div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label small">Data</label>
                            <input type="date" name="expense_date" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small">Importo €</label>
                            <input type="number" step="0.01" min="0.01" name="amount" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small">Pagamento</label>
                            <select name="payment_method" class="form-select" required>
                                <?php foreach ($paymentMethods as $pm): ?>
                                    <option value="<?= htmlspecialchars($pm, ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($paymentLabels[$pm] ?? $pm, ENT_QUOTES, 'UTF-8') ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Categoria</label>
                            <select name="category_id" class="form-select">
                                <option value="">— Nessuna —</option>
                                <?php foreach ($categories as $c): ?>
                                    <option value="<?= (int) $c['id'] ?>"><?= htmlspecialchars((string) $c['name'], ENT_QUOTES, 'UTF-8') ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Conto <span class="text-muted">(opz.)</span></label>
                            <select name="account_id" class="form-select">
                                <option value="">— Nessuno —</option>
                                <?php foreach ($accounts as $a): ?>
                                    <option value="<?= (int) $a['id'] ?>"><?= htmlspecialchars((string) $a['name'], ENT_QUOTES, 'UTF-8') ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-12">
                            <label class="form-label small">Descrizione</label>
                            <textarea id="expense-edit-description" name="description" class="form-control mx-rich-editor" rows="4" maxlength="2048" placeholder="es. Pranzo bar"></textarea>
                        </div>
                        <div class="col-12">
                            <label class="form-label small">Tag <span class="text-muted">(separati da virgola)</span></label>
                            <input type="text" name="tags" class="form-control" list="all-tags-datalist" placeholder="lavoro, ufficio, urgente">
                        </div>
                        <div class="col-md-7">
                            <label class="form-label small">Condivisa con <span class="text-muted">(opz.)</span></label>
                            <input type="text" name="shared_with" class="form-control" maxlength="255" placeholder="Marco, Luca">
                        </div>
                        <div class="col-md-5">
                            <label class="form-label small">Tua quota €</label>
                            <input type="number" step="0.01" min="0.01" name="share_amount" class="form-control" placeholder="0,00">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annulla</button>
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-check-lg me-1"></i>Salva modifiche
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- ── Modal: allegati ────────────────────────────────────────────────────── -->
<div class="modal fade" id="attachments-modal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-paperclip me-1"></i>Allegati spesa</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
            </div>
            <div class="modal-body">
                <div id="attachments-list" class="mb-3">
                    <div class="text-muted small text-center py-2">Caricamento…</div>
                </div>
                <hr>
                <form id="attachment-upload-form" enctype="multipart/form-data" class="mb-0">
                    <?= Csrf::field() ?>
                    <input type="hidden" name="expense_id" value="">
                    <label class="form-label small">Aggiungi file (jpg, png, gif, webp, pdf — max 8 MB)</label>
                    <div class="input-group">
                        <input type="file" name="file" accept="image/*,application/pdf" class="form-control" required>
                        <button type="submit" class="btn btn-primary">
                            <i class="bi bi-upload me-1"></i>Carica
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script type="module" src="<?= $asset('js/pages/expenses.js') ?>"></script>
