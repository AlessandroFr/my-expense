import { asset, csrfField } from '../view.js';

export const render = ({ csrfToken }) => {
  const today = new Date().toISOString().slice(0, 10);
  return `
<div class="row mb-3">
    <div class="col-12 d-flex align-items-center flex-wrap gap-2">
        <div>
            <h1 class="h3 mb-0"><i class="bi bi-graph-up-arrow me-2"></i>Investimenti</h1>
            <div class="text-muted small">Strumenti detenuti, operazioni e performance per conto deposito titoli.</div>
        </div>
        <div class="ms-auto d-flex gap-2 align-items-center">
            <label class="small text-muted mb-0">Conto:</label>
            <select id="securities-account-filter" class="form-select form-select-sm" style="min-width:220px"></select>
        </div>
    </div>
</div>

<div class="row g-3 mb-3" id="securities-kpi">
    <div class="col-12 text-center text-muted py-3">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento patrimonio…
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Nuova operazione</h2>
        <form id="security-tx-form" class="row g-2">
            ${csrfField(csrfToken)}            <div class="col-12">
                <label class="form-label small mb-1">Tipo</label>
                <select name="kind" class="form-select" required>
                    <option value="BUY">Acquisto</option>
                    <option value="SELL">Vendita</option>
                    <option value="DIVIDEND">Dividendo / cedola</option>
                    <option value="FEE">Commissione</option>
                    <option value="SPLIT">Split (aggiusta qty)</option>
                </select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Strumento</label>
                <select name="instrument_id" class="form-select" required data-role="instrument">
                    <option value="">Seleziona…</option>
                </select>
                <div class="form-text small">
                    <a href="#" data-action="new-instrument"><i class="bi bi-plus-lg"></i> Nuovo strumento</a>
                </div>
            </div>
            <div class="col-7">
                <label class="form-label small mb-1">Quantità</label>
                <input type="text" name="quantity" class="form-control" inputmode="decimal" placeholder="10">
            </div>
            <div class="col-5">
                <label class="form-label small mb-1" data-label-for="price">Prezzo</label>
                <input type="text" name="price" class="form-control" inputmode="decimal" placeholder="100,00">
            </div>
            <div class="col-7">
                <label class="form-label small mb-1">Data operazione</label>
                <input type="date" name="trade_date" class="form-control" required value="${today}">
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Commissioni</label>
                <input type="text" name="fee" class="form-control" inputmode="decimal" value="0">
            </div>
            <div class="col-12 d-none" data-show-for="DIVIDEND,SELL">
                <label class="form-label small mb-1">Ritenuta fiscale (€)</label>
                <input type="text" name="tax_withheld" class="form-control" inputmode="decimal" value="0">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Note</label>
                <input type="text" name="notes" class="form-control" maxlength="500">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Registra operazione
                </button>
            </div>
        </form>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <div class="d-flex align-items-center mb-2">
            <h2 class="h6 mb-0 flex-grow-1"><i class="bi bi-table me-1"></i>Posizioni</h2>
        </div>
        <div id="securities-holdings">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <div class="d-flex align-items-center mb-2">
            <h2 class="h6 mb-0 flex-grow-1"><i class="bi bi-clock-history me-1"></i>Operazioni recenti</h2>
        </div>
        <div id="securities-transactions">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</section>
</div>

<dialog id="instrument-create-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 640px; width: 95%">
    <form id="instrument-create-form" method="dialog" class="m-0">
        ${csrfField(csrfToken)}        <div class="modal-content border-0">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-plus-circle me-2"></i>Nuovo strumento</h5>
                <button type="button" class="btn-close" data-instr-action="close" aria-label="Chiudi"></button>
            </div>
            <div class="modal-body">
                <div class="row g-2">
                    <div class="col-12">
                        <label class="form-label small mb-1">Nome</label>
                        <input type="text" name="name" class="form-control" required maxlength="128" placeholder="Es: Vanguard FTSE All-World UCITS ETF">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">ISIN</label>
                        <input type="text" name="isin" class="form-control" maxlength="12" placeholder="IE00BK5BQT80">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">Ticker</label>
                        <input type="text" name="ticker" class="form-control" maxlength="16" placeholder="VWCE">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">Asset class</label>
                        <select name="asset_class_id" class="form-select" data-role="asset-class">
                            <option value="">—</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Currency</label>
                        <input type="text" name="currency" class="form-control" maxlength="3" value="EUR">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Conto</label>
                        <select name="account_id" class="form-select" data-role="instrument-account">
                            <option value="">Globale</option>
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Note</label>
                        <input type="text" name="notes" class="form-control" maxlength="500">
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-instr-action="close">Annulla</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-circle me-1"></i>Crea</button>
            </div>
        </div>
    </form>
</dialog>

<script type="module" src="${asset('js/pages/securities.js')}"></script>
`;
};
