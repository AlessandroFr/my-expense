<?php
/**
 * Report annuale — dashboard storica con KPI, andamento 12-mesi, heatmap, top spese.
 */

use App\Config;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
$thisYear = (int) date('Y');
?>
<div class="row mb-3 align-items-center">
    <div class="col-md-8">
        <h1 class="h3 mb-0"><i class="bi bi-bar-chart-steps me-2"></i>Report annuale</h1>
        <div class="text-muted small">Anno: <span id="report-year-label"><?= $thisYear ?></span></div>
    </div>
    <div class="col-md-4 text-md-end">
        <select id="report-year" class="form-select d-inline-block" style="width:auto">
            <?php for ($y = $thisYear; $y >= $thisYear - 9; $y--): ?>
                <option value="<?= $y ?>" <?= $y === $thisYear ? 'selected' : '' ?>><?= $y ?></option>
            <?php endfor; ?>
        </select>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-md-3">
        <div class="card shadow-sm h-100 border-start border-danger border-4">
            <div class="card-body">
                <div class="text-muted small text-uppercase">Spese totali</div>
                <div id="r-total-exp" class="h3 fw-semibold text-danger mt-1">EUR -</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card shadow-sm h-100 border-start border-success border-4">
            <div class="card-body">
                <div class="text-muted small text-uppercase">Entrate totali</div>
                <div id="r-total-inc" class="h3 fw-semibold text-success mt-1">EUR -</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card shadow-sm h-100 border-start border-primary border-4">
            <div class="card-body">
                <div class="text-muted small text-uppercase">Bilancio anno</div>
                <div id="r-net" class="h3 fw-semibold mt-1">EUR -</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <div class="text-muted small text-uppercase">Media mensile spese</div>
                <div id="r-avg" class="h3 fw-semibold mt-1">EUR -</div>
                <div class="small text-muted" id="r-extremes"></div>
            </div>
        </div>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-lg-7">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <h2 class="h6 mb-3"><i class="bi bi-graph-up me-1"></i>Andamento mensile</h2>
                <div style="position:relative;height:300px"><canvas id="chart-yearly-trend"></canvas></div>
            </div>
        </div>
    </div>
    <div class="col-lg-5">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <h2 class="h6 mb-3"><i class="bi bi-pie-chart me-1"></i>Categorie anno</h2>
                <div style="position:relative;height:300px"><canvas id="chart-yearly-cats"></canvas></div>
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm mb-4">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-grid-3x3 me-1"></i>Heatmap top 5 categorie x mesi</h2>
        <div class="table-responsive">
            <table class="table table-sm table-bordered align-middle text-center mb-0" id="heatmap-table">
                <thead></thead>
                <tbody></tbody>
            </table>
        </div>
        <div class="small text-muted mt-2">Colore proporzionale all'importo del mese sulla colonna.</div>
    </div>
</div>

<!-- ── Bilancio per anagrafica ──────────────────────────────────────────── -->
<div class="card shadow-sm mb-4">
    <div class="card-body">
        <h2 class="h6 mb-3 d-flex justify-content-between align-items-center">
            <span><i class="bi bi-person-rolodex me-1"></i>Bilancio per anagrafica</span>
            <a href="<?= htmlspecialchars($base . '/contacts', ENT_QUOTES, 'UTF-8') ?>" class="small text-decoration-none">
                Vedi tutte <i class="bi bi-arrow-right ms-1"></i>
            </a>
        </h2>
        <div class="row g-3">
            <div class="col-lg-7">
                <div class="table-responsive">
                    <table class="table table-sm table-hover align-middle mb-0" id="contact-balance-table">
                        <thead class="table-light">
                            <tr>
                                <th>Anagrafica</th>
                                <th class="text-end">Spese</th>
                                <th class="text-end">Entrate</th>
                                <th class="text-end">Saldo netto</th>
                            </tr>
                        </thead>
                        <tbody id="contact-balance-tbody">
                            <tr><td colspan="4" class="text-center text-muted py-3">
                                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="col-lg-5">
                <div class="row g-2">
                    <div class="col-6">
                        <div class="small text-muted mb-1 text-center">Top fornitori</div>
                        <div style="position:relative;height:200px"><canvas id="chart-top-suppliers"></canvas></div>
                    </div>
                    <div class="col-6">
                        <div class="small text-muted mb-1 text-center">Top clienti</div>
                        <div style="position:relative;height:200px"><canvas id="chart-top-customers"></canvas></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-trophy me-1"></i>Top 10 spese</h2>
        <div class="table-responsive">
            <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th>Data</th>
                        <th>Categoria</th>
                        <th>Descrizione</th>
                        <th class="text-end">Importo</th>
                    </tr>
                </thead>
                <tbody id="top-expenses-tbody"></tbody>
            </table>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
<script type="module" src="<?= $asset('js/pages/reports.js') ?>"></script>
