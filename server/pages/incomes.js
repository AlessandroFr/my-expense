import { esc, each, asset, csrfField } from '../view.js';

export const render = ({ csrfToken, accounts, contacts, today }) => `
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-cash-stack me-2 text-success"></i>Entrate</h1>
        <div class="text-muted small">Stipendi, rimborsi, freelance -- tutto cio' che entra.</div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">

<div class="card shadow-sm">
    <ul class="nav nav-fill mx-aside-tabs" id="incomes-aside-tabs" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link active" id="inc-tab-new-tab" data-bs-toggle="tab" data-bs-target="#inc-tab-new" type="button" role="tab" aria-selected="true" title="Nuova entrata">
                <i class="bi bi-plus-circle"></i><span class="mx-tab-label">Nuova</span>
            </button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="inc-tab-filters-tab" data-bs-toggle="tab" data-bs-target="#inc-tab-filters" type="button" role="tab" aria-selected="false" title="Filtri">
                <i class="bi bi-funnel"></i><span class="mx-tab-label">Filtri</span>
            </button>
        </li>
    </ul>
    <div class="card-body">
        <div class="tab-content">
            <div class="tab-pane fade show active" id="inc-tab-new" role="tabpanel">
                <form id="income-create-form" class="row g-2 align-items-end">
                    ${csrfField(csrfToken)}                    <div class="col-6">
                        <label class="form-label small mb-1">Data</label>
                        <input type="date" name="income_date" class="form-control" value="${esc(today)}" required>
                    </div>
                    <div class="col-6">
                        <label class="form-label small mb-1">Importo (EUR)</label>
                        <input type="text" name="amount" class="form-control" inputmode="decimal" required>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Origine</label>
                        <input type="text" name="source" class="form-control" list="income-sources" placeholder="Stipendio, Freelance..." required maxlength="64">
                        <datalist id="income-sources"></datalist>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Cliente / Pagatore <span class="text-muted">(opz., crea al volo)</span></label>
                        <input type="text" name="contact_name" class="form-control" list="contacts-datalist" maxlength="120" placeholder="es. Acme Srl, Mario Rossi">
                        <datalist id="contacts-datalist">
                            ${each(contacts, (cn) => `                                <option value="${esc(cn.name)}"></option>
                            `)}                        </datalist>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Conto <span class="text-muted">(opz.)</span></label>
                        <select name="account_id" class="form-select">
                            <option value="">— Nessuno —</option>
                            ${each(accounts, (a) => `                                <option value="${a.id}">${esc(a.name)}</option>
                            `)}                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Descrizione</label>
                        <textarea id="income-create-description" name="description" class="form-control mx-rich-editor" rows="3" maxlength="2048" placeholder="Note opzionali"></textarea>
                    </div>
                    <div class="col-12 d-grid">
                        <button type="submit" class="btn btn-success">
                            <i class="bi bi-check-circle me-1"></i>Aggiungi
                        </button>
                    </div>
                </form>
            </div>

            <div class="tab-pane fade" id="inc-tab-filters" role="tabpanel">
                <form id="income-filters" class="row g-2 align-items-end">
                    <div class="col-6">
                        <label class="form-label small mb-1">Da</label>
                        <input type="date" name="date_from" class="form-control form-control-sm">
                    </div>
                    <div class="col-6">
                        <label class="form-label small mb-1">A</label>
                        <input type="date" name="date_to" class="form-control form-control-sm">
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Origine</label>
                        <select name="source" class="form-select form-select-sm">
                            <option value="">Tutte</option>
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Conto</label>
                        <select name="account_id" class="form-select form-select-sm">
                            <option value="">Tutti</option>
                            ${each(accounts, (a) => `                                <option value="${a.id}">${esc(a.name)}</option>
                            `)}                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Cliente</label>
                        <select name="contact_id" class="form-select form-select-sm">
                            <option value="">Tutti</option>
                            ${each(contacts, (cn) => `                                <option value="${cn.id}">${esc(cn.name)}</option>
                            `)}                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1">Cerca</label>
                        <input type="text" name="search" class="form-control form-control-sm" placeholder="origine o descrizione">
                    </div>
                    <div class="col-12 d-grid">
                        <button type="button" id="income-filters-reset" class="btn btn-outline-secondary btn-sm">
                            <i class="bi bi-x-circle me-1"></i>Reset
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <nav id="income-pager" class="px-3 pt-2"></nav>
    <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
            <thead class="table-light">
                <tr>
                    <th style="width:1%"></th>
                    <th class="text-nowrap">Data</th>
                    <th>Conto</th>
                    <th class="text-nowrap">Origine</th>
                    <th>Descrizione</th>
                    <th class="text-end text-nowrap">Importo</th>
                    <th class="text-end" style="width:1%">Azioni</th>
                </tr>
            </thead>
            <tbody id="income-tbody">
                <tr><td colspan="7" class="text-center text-muted py-4">
                    <div class="spinner-border spinner-border-sm me-2"></div>Caricamento...
                </td></tr>
            </tbody>
            <tfoot>
                <tr class="table-light">
                    <th colspan="5" class="text-end">Totale visibile</th>
                    <th class="text-end" id="income-total">EUR -</th>
                    <th></th>
                </tr>
            </tfoot>
        </table>
    </div>
</div>
</section>
</div>

<!-- Modal: edit entrata -->
<div class="modal fade" data-bs-backdrop="static" data-bs-keyboard="false" id="income-edit-modal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
            <form id="income-edit-form" autocomplete="off">
                ${csrfField(csrfToken)}                <input type="hidden" name="id" value="">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="bi bi-pencil-square me-1"></i>Modifica entrata</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
                </div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label small">Data</label>
                            <input type="date" name="income_date" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Importo (EUR)</label>
                            <input type="text" name="amount" class="form-control" inputmode="decimal" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Origine</label>
                            <input type="text" name="source" class="form-control" list="income-sources" required maxlength="64">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Cliente / Pagatore <span class="text-muted">(opz.)</span></label>
                            <input type="text" name="contact_name" class="form-control" list="contacts-datalist" maxlength="120">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small">Conto <span class="text-muted">(opz.)</span></label>
                            <select name="account_id" class="form-select">
                                <option value="">— Nessuno —</option>
                                ${each(accounts, (a) => `                                    <option value="${a.id}">${esc(a.name)}</option>
                                `)}                            </select>
                        </div>
                        <div class="col-12">
                            <label class="form-label small">Descrizione</label>
                            <textarea id="income-edit-description" name="description" class="form-control mx-rich-editor" rows="4" maxlength="2048" placeholder="Note opzionali"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annulla</button>
                    <button type="submit" class="btn btn-success">
                        <i class="bi bi-check-lg me-1"></i>Salva modifiche
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<script type="module" src="${asset('js/pages/incomes.js')}"></script>
`;
