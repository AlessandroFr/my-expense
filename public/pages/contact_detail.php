<?php
/**
 * Dettaglio anagrafica: KPI periodo, breakdown categorie, lista movimenti.
 * $id arriva dal renderPage('contact_detail', ['id' => …]).
 */

use App\Auth;
use App\Config;
use App\Contact;

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
        <div>
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

<script>window.MX_CONTACT = { id: <?= (int) $contact['id'] ?>, year: <?= $year ?> };</script>
<script type="module" src="<?= $asset('js/pages/contact_detail.js') ?>"></script>
<?php endif; ?>
