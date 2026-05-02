<?php
/**
 * Dashboard mensile — KPI + grafici (Chart.js via CDN, popolati da JS).
 */

use App\Auth;
use App\Config;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
?>
<div class="row mb-3 align-items-center">
    <div class="col-md-8">
        <h1 class="h3 mb-0"><i class="bi bi-speedometer2 me-2"></i>Dashboard</h1>
        <div class="text-muted small">Ciao, <strong><?= htmlspecialchars(Auth::username() ?? '', ENT_QUOTES, 'UTF-8') ?></strong> — riepilogo mese corrente.</div>
    </div>
    <div class="col-md-4 text-md-end">
        <a href="<?= htmlspecialchars($base . '/expenses', ENT_QUOTES, 'UTF-8') ?>" class="btn btn-primary">
            <i class="bi bi-plus-circle me-1"></i>Nuova spesa
        </a>
    </div>
</div>

<!-- ── KPI cards ─────────────────────────────────────────────────────────── -->
<div class="row g-3 mb-4">
    <div class="col-md-4">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <div class="text-muted small text-uppercase">Mese corrente</div>
                <div id="kpi-current" class="display-6 fw-semibold mt-1">€ —</div>
                <div class="small text-muted" id="kpi-current-month"></div>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <div class="text-muted small text-uppercase">Mese precedente</div>
                <div id="kpi-previous" class="display-6 fw-semibold mt-1">€ —</div>
                <div class="small text-muted">Confronto storico</div>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <div class="text-muted small text-uppercase">Variazione</div>
                <div id="kpi-delta" class="display-6 fw-semibold mt-1">—</div>
                <div class="small text-muted">vs mese precedente</div>
            </div>
        </div>
    </div>
</div>

<!-- ── Grafici ───────────────────────────────────────────────────────────── -->
<div class="row g-3">
    <div class="col-lg-5">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <h2 class="h6 mb-3"><i class="bi bi-pie-chart me-1"></i>Distribuzione per categoria</h2>
                <div style="position:relative;height:300px">
                    <canvas id="chart-by-category"></canvas>
                </div>
                <div id="by-category-empty" class="text-center text-muted small mt-3 d-none">
                    Nessuna spesa nel mese corrente.
                </div>
            </div>
        </div>
    </div>
    <div class="col-lg-7">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <h2 class="h6 mb-3"><i class="bi bi-bar-chart me-1"></i>Andamento ultimi 6 mesi</h2>
                <div style="position:relative;height:300px">
                    <canvas id="chart-by-month"></canvas>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Chart.js da CDN -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
<script type="module" src="<?= htmlspecialchars($base . '/js/pages/dashboard.js', ENT_QUOTES, 'UTF-8') ?>"></script>
