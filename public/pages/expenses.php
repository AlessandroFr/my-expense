<?php
/**
 * Pagina lista spese — AJAX via FetchRequest.
 * La tabella e il totale sono popolati lato client da public/js/pages/expenses.js.
 */

use App\Account;
use App\Auth;
use App\Category;
use App\Config;
use App\Csrf;
use App\Expense;

$base       = rtrim(Config::get('app')['base_url'] ?? '', '/');
$userId     = (int) Auth::userId();
$categories = Category::allForUser($userId);
$accounts    = Account::allForUser($userId, false);
$defaultCash = Account::defaultCashFor($userId);
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

                    <div class="table-responsive" style="max-height: 60vh">
                        <table class="table table-sm table-hover align-middle mb-0">
                            <thead class="table-light sticky-top">
                                <tr>
                                    <th style="width:40px"><input type="checkbox" id="bank-toggle-all" checked title="Seleziona/deseleziona tutte"></th>
                                    <th style="width:120px" title="Data operazione (data applicazione)">Data op.</th>
                                    <th style="width:120px" title="Data valuta">Valuta</th>
                                    <th style="width:120px">Tipo</th>
                                    <th>Descrizione</th>
                                    <th style="width:200px">Categoria / Origine</th>
                                    <th style="width:120px">Pagamento</th>
                                    <th style="width:110px" class="text-end">Importo</th>
                                </tr>
                            </thead>
                            <tbody id="bank-preview-tbody"></tbody>
                        </table>
                    </div>

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

<!-- ── Toolbar azioni rapide ────────────────────────────────────────────── -->
<div class="card shadow-sm mb-3">
    <div class="card-body py-2 d-flex flex-wrap gap-2">
        <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" title="Filtri salvati">
                <i class="bi bi-bookmark me-1"></i>Filtri
            </button>
            <ul class="dropdown-menu" id="saved-filters-menu">
                <li><a class="dropdown-item small" href="#" data-saved-action="save"><i class="bi bi-floppy me-1"></i>Salva filtro corrente...</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><span class="dropdown-item-text small text-muted">Nessun filtro salvato.</span></li>
            </ul>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-export-csv" title="Scarica CSV con i filtri attivi">
            <i class="bi bi-download me-1"></i>Esporta
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-import-csv" data-bs-toggle="modal" data-bs-target="#csv-import-modal" title="Importa CSV semplice">
            <i class="bi bi-upload me-1"></i>Importa
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-import-bank" data-bs-toggle="modal" data-bs-target="#bank-import-modal" title="Importa estratto conto bancario">
            <i class="bi bi-bank me-1"></i>Estratto conto
        </button>
    </div>
</div>

<!-- ── Filtri ────────────────────────────────────────────────────────────── -->
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-funnel me-1"></i>Filtri</h2>
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
</div>

<!-- ── Form CREATE inline ───────────────────────────────────────────────── -->
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 text-muted mb-3"><i class="bi bi-plus-circle me-1"></i>Nuova spesa</h2>
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
                <input type="text" name="description" class="form-control" maxlength="512" placeholder="es. Pranzo bar">
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
</div>

</aside>

<section class="col-12 col-lg-7 col-xl-8">
<!-- ── Tabella spese ─────────────────────────────────────────────────────── -->
<div class="card shadow-sm">
    <div class="card-body p-0">
        <nav id="expenses-pager" class="px-3 pt-2"></nav>
        <table class="table table-hover mb-0 align-middle">
            <thead class="table-light">
                <tr>
                    <th style="width:1%"></th>
                    <th>Data</th>
                    <th>Conto</th>
                    <th>Categoria</th>
                    <th>Descrizione</th>
                    <th class="text-center" style="width:1%" title="Tag">#</th>
                    <th class="text-center" style="width:1%" title="Pagamento"><i class="bi bi-credit-card"></i></th>
                    <th class="text-end">Importo</th>
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
</section>
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
