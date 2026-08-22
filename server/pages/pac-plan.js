import { esc, asset, csrfField, vuoto } from '../view.js';

export const render = ({ csrfToken, plan, freqLabel }) => {
  const oggi = new Date().toISOString().slice(0, 10);
  return `
<div class="row mb-3">
    <div class="col-12 d-flex flex-wrap align-items-center gap-2">
        <a href="${esc('/pac')}" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-chevron-left"></i> Torna
        </a>
        <div class="ms-2">
            <h1 class="h3 mb-0">${esc(plan.name)}</h1>
            <div class="text-muted small">
                ${esc(freqLabel)} · €${esc(plan.amount)} ·
                ${esc(plan.fund_name ?? '—')}                ${(!vuoto(plan.asset_class_name)) ? `                    · <span class="badge" style="background:${esc(plan.asset_class_color ?? '#6c757d')}">${esc(plan.asset_class_name)}</span>
                ` : ``}                ${(plan.active === 0) ? `                    · <span class="badge bg-secondary">disattivato</span>
                ` : ``}            </div>
        </div>
        <div class="ms-auto">
            <button type="button" class="btn btn-sm btn-outline-primary" id="plan-run-now"
                    data-id="${plan.id}">
                <i class="bi bi-play-circle me-1"></i>Genera ora
            </button>
        </div>
    </div>
</div>

<div class="row g-3 mb-3" id="plan-kpi"></div>

<div class="card shadow-sm mb-3">
    <div class="card-body">
        <div class="d-flex align-items-center gap-2 mb-2">
            <h2 class="h6 mb-0"><i class="bi bi-graph-up me-1"></i>Andamento</h2>
            <span class="small text-muted" id="plan-chart-note"></span>
        </div>
        <div style="position:relative;height:260px"><canvas id="plan-chart"></canvas></div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-cash-coin me-1"></i>Versamento manuale</h2>
        <form id="contribution-create-form" class="row g-2">
            ${csrfField(csrfToken)}            <input type="hidden" name="plan_id" value="${plan.id}">
            <div class="col-7">
                <label class="form-label small mb-1">Importo (€)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required value="${esc(plan.amount)}">
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="contribution_date" class="form-control" required value="${oggi}">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Note</label>
                <input type="text" name="notes" class="form-control" maxlength="255">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Versa
                </button>
            </div>
        </form>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-cash me-1"></i>Aggiorna NAV fondo</h2>
        <form id="nav-update-form" class="row g-2">
            ${csrfField(csrfToken)}            <input type="hidden" name="fund_id" value="${plan.fund_id}">
            <div class="col-7">
                <label class="form-label small mb-1">NAV</label>
                <input type="text" name="nav" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="nav_date" class="form-control" required value="${oggi}">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-secondary">
                    <i class="bi bi-check-circle me-1"></i>Salva NAV
                </button>
            </div>
        </form>
        <hr class="my-3">
        <div class="small text-muted mb-2">Storico NAV recente</div>
        <div id="nav-history">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-clock-history me-1"></i>Versamenti</h2>
        <div id="contributions-list">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</section>
</div>

<script>
window.MX_PLAN = ${JSON.stringify({
  id: plan.id,
  fund_id: plan.fund_id,
  amount: plan.amount,
  name: plan.name,
  source_account_id: plan.source_account_id,
})};
</script>
<script src="/vendor/chart/chart.umd.min.js"></script>
<script type="module" src="${asset('js/pages/pac-plan.js')}"></script>
`;
};
