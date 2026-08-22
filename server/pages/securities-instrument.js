import { esc, asset, csrfField, isEmpty } from '../view.js';

export const render = ({ csrfToken, instrument }) => {
  const today = new Date().toISOString().slice(0, 10);
  return `
<div class="row mb-3">
    <div class="col-12 d-flex align-items-center flex-wrap gap-2">
        <a href="${esc('/securities')}" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-chevron-left"></i> Torna
        </a>
        <div class="ms-2">
            <h1 class="h3 mb-0">${esc(instrument.name)}</h1>
            <div class="text-muted small">
                ${(!isEmpty(instrument.ticker)) ? `                    <span class="badge bg-secondary me-1">${esc(instrument.ticker)}</span>
                ` : ``}                ${(!isEmpty(instrument.isin)) ? `                    ISIN: <code>${esc(instrument.isin)}</code>
                ` : ``}                · ${esc(instrument.currency ?? 'EUR')}                ${(!isEmpty(instrument.asset_class_name)) ? `                    · <span class="badge" style="background:${esc(instrument.asset_class_color ?? '#6c757d')}">${esc(instrument.asset_class_name)}</span>
                ` : ``}            </div>
        </div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-cash me-1"></i>Aggiorna quotazione</h2>
        <form id="price-update-form" class="row g-2">
            ${csrfField(csrfToken)}            <input type="hidden" name="instrument_id" value="${instrument.id}">
            <div class="col-7">
                <label class="form-label small mb-1">Prezzo (${esc(instrument.currency ?? 'EUR')})</label>
                <input type="text" name="price" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Data</label>
                <input type="date" name="price_date" class="form-control" required value="${today}">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Salva
                </button>
            </div>
        </form>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-clock-history me-1"></i>Storico prezzi</h2>
        <div id="price-history">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-graph-up me-1"></i>Andamento</h2>
        <div style="height:280px"><canvas id="price-chart"></canvas></div>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-list-ul me-1"></i>Operazioni</h2>
        <div id="instrument-transactions">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</section>
</div>

<script>window.MX_INSTRUMENT_ID = ${instrument.id};</script>
<script type="module" src="${asset('js/pages/security-instrument.js')}"></script>
`;
};
