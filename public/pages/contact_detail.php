<?php
/**
 * Dettaglio anagrafica: KPI periodo, breakdown categorie, lista movimenti.
 * $id arriva dal renderPage('contact_detail', ['id' => …]).
 */

use App\Auth;
use App\Config;
use App\Contact;
use App\Csrf;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
$userId = (int) Auth::userId();
$id = (int) ($id ?? 0);
$contact = $id > 0 ? Contact::findForUser($id, $userId) : null;
?>
<?php if ($contact === null): ?>
    <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle me-2"></i>Anagrafica non trovata.
        <a href="<?= htmlspecialchars($base . '/contacts', ENT_QUOTES, 'UTF-8') ?>">Torna alla lista</a>.
    </div>
<?php else: ?>
<?php
$year = (int) ($_GET['year'] ?? date('Y'));
?>
<div class="row mb-3">
    <div class="col-12 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
            <a href="<?= htmlspecialchars($base . '/contacts', ENT_QUOTES, 'UTF-8') ?>" class="text-decoration-none small text-muted">
                <i class="bi bi-arrow-left me-1"></i>Anagrafiche
            </a>
            <h1 class="h3 mb-0 mt-1">
                <span class="d-inline-block rounded-circle align-middle me-2"
                      style="width:1rem;height:1rem;background-color:<?= htmlspecialchars((string) $contact['color'], ENT_QUOTES, 'UTF-8') ?>"></span>
                <?= htmlspecialchars((string) $contact['name'], ENT_QUOTES, 'UTF-8') ?>
            </h1>
            <div class="text-muted small">
                <?php if (!empty($contact['vat_number'])): ?>
                    <code class="me-2">P.IVA <?= htmlspecialchars((string) $contact['vat_number'], ENT_QUOTES, 'UTF-8') ?></code>
                <?php endif; ?>
                <?php if (!empty($contact['email'])): ?>
                    <a href="mailto:<?= htmlspecialchars((string) $contact['email'], ENT_QUOTES, 'UTF-8') ?>" class="me-2">
                        <i class="bi bi-envelope"></i> <?= htmlspecialchars((string) $contact['email'], ENT_QUOTES, 'UTF-8') ?>
                    </a>
                <?php endif; ?>
                <?php if (!empty($contact['iban'])): ?>
                    <code class="me-2">IBAN <?= htmlspecialchars((string) $contact['iban'], ENT_QUOTES, 'UTF-8') ?></code>
                <?php endif; ?>
            </div>
        </div>
        <div class="d-flex gap-2 align-items-center flex-wrap">
            <button type="button" class="btn btn-sm btn-outline-warning" data-action="reassign-open">
                <i class="bi bi-arrow-left-right me-1"></i>Riassegna movimenti
            </button>
            <label class="form-label small mb-0 me-1">Anno</label>
            <select id="year-picker" class="form-select form-select-sm d-inline-block w-auto">
                <?php for ($y = (int) date('Y'); $y >= (int) date('Y') - 6; $y--): ?>
                    <option value="<?= $y ?>" <?= $y === $year ? 'selected' : '' ?>><?= $y ?></option>
                <?php endfor; ?>
            </select>
        </div>
    </div>
</div>

<div class="row g-3 mb-3">
    <div class="col-md-4">
        <div class="card shadow-sm">
            <div class="card-body">
                <div class="text-muted small">Spese totali</div>
                <div class="h3 mb-0 text-danger" id="kpi-expenses">—</div>
                <div class="small text-muted" id="kpi-expenses-count">—</div>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card shadow-sm">
            <div class="card-body">
                <div class="text-muted small">Entrate totali</div>
                <div class="h3 mb-0 text-success" id="kpi-incomes">—</div>
                <div class="small text-muted" id="kpi-incomes-count">—</div>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card shadow-sm">
            <div class="card-body">
                <div class="text-muted small">Saldo netto</div>
                <div class="h3 mb-0" id="kpi-net">—</div>
                <div class="small text-muted">entrate − spese</div>
            </div>
        </div>
    </div>
</div>

<div class="row g-3">
    <div class="col-12 col-lg-5">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <h6 class="mb-2"><i class="bi bi-pie-chart me-1"></i>Per categoria</h6>
                <div style="position:relative; height:280px"><canvas id="chart-breakdown"></canvas></div>
            </div>
        </div>
    </div>
    <div class="col-12 col-lg-7">
        <div class="card shadow-sm h-100">
            <div class="card-body p-0">
                <h6 class="mb-0 p-3 pb-2"><i class="bi bi-list-ul me-1"></i>Movimenti</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0 align-middle">
                        <thead class="table-light">
                            <tr>
                                <th>Data</th>
                                <th>Tipo</th>
                                <th>Categoria</th>
                                <th>Descrizione</th>
                                <th class="text-end">Importo</th>
                            </tr>
                        </thead>
                        <tbody id="movements-tbody">
                            <tr><td colspan="5" class="text-center text-muted py-3">
                                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<dialog id="reassign-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 1100px; width: 95%">
    <form id="reassign-form" method="dialog" class="m-0">
        <?= Csrf::field() ?>
        <input type="hidden" name="source_contact_id" value="<?= (int) $contact['id'] ?>">
        <div class="modal-content border-0">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-arrow-left-right me-2"></i>
                    Riassegna movimenti di <?= htmlspecialchars((string) $contact['name'], ENT_QUOTES, 'UTF-8') ?>
                </h5>
                <button type="button" class="btn-close" data-action="close-reassign"></button>
            </div>
            <div class="modal-body">
                <div class="row g-2 align-items-end mb-3">
                    <div class="col-md-7">
                        <label class="form-label small mb-1">Anagrafica destinazione predefinita</label>
                        <input type="text" id="reassign-default-target" class="form-control form-control-sm"
                               list="reassign-targets-datalist" autocomplete="off"
                               placeholder="Cerca per nome…">
                        <datalist id="reassign-targets-datalist"></datalist>
                    </div>
                    <div class="col-md-5 text-md-end">
                        <button type="button" class="btn btn-sm btn-outline-primary" data-action="apply-default-to-selected">
                            <i class="bi bi-magic me-1"></i>Applica ai selezionati
                        </button>
                    </div>
                </div>
                <div class="d-flex flex-wrap gap-2 mb-2 align-items-center">
                    <span class="small text-muted me-1">Selezione rapida (pagina corrente):</span>
                    <div class="btn-group btn-group-sm">
                        <button type="button" class="btn btn-outline-secondary" data-action="select-page">Tutti</button>
                        <button type="button" class="btn btn-outline-secondary" data-action="select-none">Nessuno</button>
                        <button type="button" class="btn btn-outline-secondary" data-action="select-kind" data-kind="expense">Spese</button>
                        <button type="button" class="btn btn-outline-secondary" data-action="select-kind" data-kind="income">Entrate</button>
                        <button type="button" class="btn btn-outline-secondary" data-action="select-kind" data-kind="recurring">Ricorrenti</button>
                    </div>
                </div>
                <div class="table-responsive" style="max-height:55vh">
                    <table class="table table-sm align-middle mb-0">
                        <thead class="table-light position-sticky top-0">
                            <tr>
                                <th style="width:1%"><input type="checkbox" class="form-check-input" data-action="toggle-page-checkbox"></th>
                                <th>Tipo</th>
                                <th>Data</th>
                                <th>Descrizione</th>
                                <th class="text-end">Importo</th>
                                <th style="min-width:220px">Riassegna a…</th>
                            </tr>
                        </thead>
                        <tbody id="reassign-tbody">
                            <tr><td colspan="6" class="text-center text-muted py-3">
                                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento movimenti…
                            </td></tr>
                        </tbody>
                    </table>
                </div>
                <nav id="reassign-pager" class="px-2 py-2 border-top"></nav>
            </div>
            <div class="modal-footer justify-content-between">
                <span id="reassign-summary" class="text-muted small">0 selezionati</span>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-secondary" data-action="close-reassign">Annulla</button>
                    <button type="submit" class="btn btn-warning" data-action="confirm-reassign" disabled>
                        <i class="bi bi-arrow-left-right me-1"></i>Riassegna selezionati…
                    </button>
                </div>
            </div>
        </div>
    </form>
</dialog>

<dialog id="reassign-confirm-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 540px; width: 95%">
    <div class="modal-content border-0">
        <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-question-circle me-2"></i>Conferma riassegnazione</h5>
            <button type="button" class="btn-close" data-action="cancel-confirm"></button>
        </div>
        <div class="modal-body">
            <p id="reassign-confirm-message" class="mb-3"></p>
            <fieldset>
                <legend class="form-label small">Cosa fare con
                    <strong><?= htmlspecialchars((string) $contact['name'], ENT_QUOTES, 'UTF-8') ?></strong>
                    al termine?</legend>
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="source_action" id="src-leave" value="leave" checked>
                    <label class="form-check-label" for="src-leave">
                        <strong>Lascia invariata</strong>
                        <span class="text-muted small d-block">Nessuna azione automatica.</span>
                    </label>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="source_action" id="src-archive" value="archive">
                    <label class="form-check-label" for="src-archive">
                        <strong>Archivia</strong>
                        <span class="text-muted small d-block">L'anagrafica resta in DB ma esce dalla lista attiva.</span>
                    </label>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="source_action" id="src-delete" value="delete">
                    <label class="form-check-label" for="src-delete">
                        <strong>Elimina</strong>
                        <span class="text-muted small d-block">Solo se nessun movimento resta collegato dopo la riassegnazione.</span>
                    </label>
                </div>
            </fieldset>
        </div>
        <div class="modal-footer justify-content-between">
            <button type="button" class="btn btn-outline-secondary" data-action="cancel-confirm">Indietro</button>
            <button type="button" class="btn btn-warning" data-action="execute-reassign">
                <i class="bi bi-check-circle me-1"></i>Conferma
            </button>
        </div>
    </div>
</dialog>

<script>window.MX_CONTACT = { id: <?= (int) $contact['id'] ?>, year: <?= $year ?> };</script>
<script type="module" src="<?= $asset('js/pages/contact_detail.js') ?>"></script>
<?php endif; ?>
