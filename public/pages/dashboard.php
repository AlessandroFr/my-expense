<?php
/**
 * Dashboard mensile — KPI + grafici (Chart.js via CDN, popolati da JS).
 */

use App\Auth;
use App\Config;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
?>
<div class="mx-page-header">
    <div>
        <h1>Ciao <?= htmlspecialchars(Auth::username() ?? '', ENT_QUOTES, 'UTF-8') ?> 👋</h1>
        <div class="sub">Riepilogo: <span data-period-label class="fw-semibold">…</span></div>
    </div>
    <a href="<?= htmlspecialchars($base . '/expenses', ENT_QUOTES, 'UTF-8') ?>" class="btn btn-primary">
        <i class="bi bi-plus-circle me-1"></i>Nuova spesa
    </a>
</div>

<!-- ── Filtro periodo ────────────────────────────────────────────────────── -->
<div class="card shadow-sm mb-3">
    <div class="card-body py-2">
        <div class="row g-2 align-items-end">
            <div class="col-12 col-md-4">
                <label class="form-label small mb-1">Periodo</label>
                <select id="dash-preset" class="form-select form-select-sm">
                    <option value="this_month" selected>Mese corrente</option>
                    <option value="last_month">Mese scorso</option>
                    <option value="this_quarter">Trimestre corrente</option>
                    <option value="this_year">Anno corrente</option>
                    <option value="last_30">Ultimi 30 giorni</option>
                    <option value="last_90">Ultimi 90 giorni</option>
                    <option value="last_12m">Ultimi 12 mesi</option>
                    <option value="custom">Personalizzato…</option>
                </select>
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label small mb-1">Da</label>
                <input type="date" id="dash-from" class="form-control form-control-sm">
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label small mb-1">A</label>
                <input type="date" id="dash-to" class="form-control form-control-sm">
            </div>
            <div class="col-12 col-md-2 text-md-end">
                <button type="button" id="dash-apply" class="btn btn-sm btn-primary w-100">
                    <i class="bi bi-arrow-clockwise me-1"></i>Applica
                </button>
            </div>
        </div>
    </div>
</div>

<!-- ── Hero: bilancio netto ─────────────────────────────────────────────── -->
<div class="mx-hero mb-4">
    <div class="mx-hero-label">Bilancio netto · <span data-period-label>…</span></div>
    <div id="kpi-net" class="mx-hero-value">€ —</div>
    <span class="mx-hero-pill"><i class="bi bi-graph-up-arrow"></i> Entrate meno spese</span>
</div>

<!-- ── Quick actions ────────────────────────────────────────────────────── -->
<div class="mx-quick-actions mb-4">
    <a href="<?= htmlspecialchars($base . '/expenses', ENT_QUOTES, 'UTF-8') ?>" class="mx-qa">
        <span class="mx-qa-emoji">➕</span>Nuova spesa
    </a>
    <a href="<?= htmlspecialchars($base . '/incomes', ENT_QUOTES, 'UTF-8') ?>" class="mx-qa">
        <span class="mx-qa-emoji">💰</span>Aggiungi entrata
    </a>
    <a href="<?= htmlspecialchars($base . '/budgets', ENT_QUOTES, 'UTF-8') ?>" class="mx-qa">
        <span class="mx-qa-emoji">🎯</span>Budget
    </a>
    <a href="<?= htmlspecialchars($base . '/reports', ENT_QUOTES, 'UTF-8') ?>" class="mx-qa">
        <span class="mx-qa-emoji">📊</span>Report
    </a>
</div>

<!-- ── KPI stat cards ───────────────────────────────────────────────────── -->
<div class="row g-3 mb-4">
    <div class="col-md-4">
        <div class="mx-stat-card spese h-100">
            <div class="mx-stat-icon">💸</div>
            <div class="mx-stat-l">Spese</div>
            <div id="kpi-current" class="mx-stat-v">€ —</div>
            <div class="mx-stat-d" id="kpi-current-month" data-period-label>&nbsp;</div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="mx-stat-card entrate h-100">
            <div class="mx-stat-icon">💵</div>
            <div class="mx-stat-l">Entrate</div>
            <div id="kpi-income" class="mx-stat-v">€ —</div>
            <div class="mx-stat-d" data-period-label>&nbsp;</div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="mx-stat-card lilac h-100">
            <div class="mx-stat-icon">📈</div>
            <div class="mx-stat-l">Variazione spese</div>
            <div id="kpi-delta" class="mx-stat-v">—</div>
            <div class="mx-stat-d">vs periodo precedente</div>
        </div>
    </div>
</div>

<!-- ── Budget progress ─────────────────────────────────────────────────── -->
<div class="card shadow-sm mb-4 d-none" id="budget-card">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-bullseye me-1"></i>Budget mese corrente</h2>
        <div id="budget-progress" class="row g-2"></div>
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
<script type="module" src="<?= $asset('js/pages/dashboard.js') ?>"></script>
