import { asset, csrfField } from '../view.js';

export const render = ({ csrfToken }) => {
  const today = new Date().toISOString().slice(0, 10);
  return `
<div class="row mb-3">
    <div class="col-12 d-flex flex-wrap align-items-center gap-2">
        <div>
            <h1 class="h3 mb-0"><i class="bi bi-piggy-bank me-2"></i>Piani di Accumulo</h1>
            <div class="text-muted small">
                Versamenti verso fondi/ETF su un conto PAC. I versamenti si segnano
                sui movimenti: in <a href="/expenses">Spese</a>, dal menu della riga,
                &laquo;Versamento PAC&raquo;.
            </div>
        </div>
    </div>
</div>

<div class="row g-3 mb-3" id="pac-kpi">
    <div class="col-12 text-center text-muted py-3">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento patrimonio…
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm mb-3">
    <div class="card-body">
        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Nuovo piano</h2>
        <form id="plan-create-form" class="row g-2">
            ${csrfField(csrfToken)}            <div class="col-12">
                <label class="form-label small mb-1">Nome piano</label>
                <input type="text" name="name" class="form-control" required maxlength="96" placeholder="Es: PAC mensile World ETF">
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Conto PAC</label>
                <select name="account_id" class="form-select" required data-role="pac-account">
                    <option value="">Seleziona…</option>
                </select>
                <div class="form-text small">Solo conti di tipo Piano accumulo (PAC).</div>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Conto sorgente (bonifico)</label>
                <select name="source_account_id" class="form-select" data-role="source-account">
                    <option value="">— da scegliere al primo versamento —</option>
                </select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Fondo</label>
                <select name="fund_id" class="form-select" required data-role="fund">
                    <option value="">Seleziona…</option>
                </select>
                <div class="form-text small">
                    <a href="#" data-action="new-fund"><i class="bi bi-plus-lg"></i> Nuovo fondo</a>
                </div>
            </div>
            <div class="col-7">
                <label class="form-label small mb-1">Importo (€)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required placeholder="100,00">
            </div>
            <div class="col-5">
                <label class="form-label small mb-1">Frequenza</label>
                <select name="frequency" class="form-select">
                    <option value="weekly">Settimanale</option>
                    <option value="monthly" selected>Mensile</option>
                    <option value="quarterly">Trimestrale</option>
                    <option value="yearly">Annuale</option>
                </select>
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Inizio</label>
                <input type="date" name="start_date" class="form-control" required value="${today}">
            </div>
            <div class="col-6">
                <label class="form-label small mb-1">Fine (opz.)</label>
                <input type="date" name="end_date" class="form-control">
            </div>
            <div class="col-12 mt-2">
                <details>
                    <summary class="small text-muted" style="cursor:pointer">
                        <i class="bi bi-bank2 me-1"></i>Riconoscimento bank import (opz.)
                    </summary>
                    <div class="row g-2 mt-2">
                        <div class="col-12">
                            <label class="form-label small mb-1">IBAN beneficiario</label>
                            <input type="text" name="beneficiary_iban" class="form-control" maxlength="34" placeholder="IT60 X054 2811 1010 0000 0123 456">
                        </div>
                        <div class="col-12">
                            <label class="form-label small mb-1">Keyword nella descrizione</label>
                            <input type="text" name="beneficiary_keyword" class="form-control" maxlength="64" placeholder="VANGUARD, MOLEINVEST, …">
                        </div>
                    </div>
                </details>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Note</label>
                <input type="text" name="notes" class="form-control" maxlength="255">
            </div>
            <div class="col-12 d-grid mt-2">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Crea piano
                </button>
            </div>
        </form>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <div class="card-body">
        <div class="d-flex align-items-center mb-3">
            <h2 class="h6 mb-0 flex-grow-1"><i class="bi bi-list-ul me-1"></i>Piani attivi</h2>
        </div>
        <div id="pac-plans-list">
            <div class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
            </div>
        </div>
    </div>
</div>
</section>
</div>

<dialog id="fund-change-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 520px; width: 95%">
    <form id="fund-change-form" method="dialog" class="m-0">
        ${csrfField(csrfToken)}        <input type="hidden" name="id">
        <div class="modal-content border-0">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-arrow-left-right me-2"></i>Cambia fondo</h5>
                <button type="button" class="btn-close" data-change-action="close" aria-label="Chiudi"></button>
            </div>
            <div class="modal-body">
                <p class="small text-muted">
                    Sposta il piano <b data-role="change-plan-name"></b> su un altro fondo.
                    I versamenti restano tutti: si rifanno solo le quote, con la
                    quotazione che il fondo nuovo aveva il giorno di ogni versamento.
                </p>
                <label class="form-label small mb-1">Fondo</label>
                <select name="fund_id" class="form-select" required data-role="change-fund">
                    <option value="">Seleziona…</option>
                </select>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-change-action="close">Annulla</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-circle me-1"></i>Sposta</button>
            </div>
        </div>
    </form>
</dialog>

<dialog id="fund-create-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 640px; width: 95%">
    <form id="fund-create-form" method="dialog" class="m-0">
        ${csrfField(csrfToken)}        <div class="modal-content border-0">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-plus-circle me-2"></i>Nuovo fondo</h5>
                <button type="button" class="btn-close" data-fund-action="close" aria-label="Chiudi"></button>
            </div>
            <div class="modal-body">
                <div class="row g-2">
                    <div class="col-12">
                        <label class="form-label small mb-1">Nome</label>
                        <input type="text" name="name" class="form-control" required maxlength="128" placeholder="Es: Vanguard FTSE All-World ETF">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">ISIN</label>
                        <input type="text" name="isin" class="form-control" maxlength="12" placeholder="IE00BK5BQT80">
                        <div class="form-text">Serve a scaricare le quotazioni da solo.</div>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">Simbolo di borsa</label>
                        <input type="text" name="symbol" class="form-control" maxlength="20" placeholder="SWDA.MI">
                        <div class="form-text">Facoltativo: lo trova dall'ISIN. Da correggere se sbaglia borsa.</div>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Tipo</label>
                        <select name="fund_type" class="form-select">
                            <option value="etf">ETF</option>
                            <option value="mutual">Fondo</option>
                            <option value="index">Indice</option>
                            <option value="other">Altro</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Currency</label>
                        <input type="text" name="currency" class="form-control" maxlength="3" value="EUR">
                    </div>
                    <div class="col-md-12">
                        <label class="form-label small mb-1">Asset class</label>
                        <select name="asset_class_id" class="form-select" data-role="fund-asset-class">
                            <option value="">—</option>
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Note</label>
                        <input type="text" name="notes" class="form-control" maxlength="500">
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-fund-action="close">Annulla</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-circle me-1"></i>Crea</button>
            </div>
        </div>
    </form>
</dialog>

<script type="module" src="${asset('js/pages/pac.js')}"></script>
`;
};
