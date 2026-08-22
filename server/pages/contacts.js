import { asset, csrfField } from '../view.js';

export const render = ({ csrfToken }) => `
<div class="row mb-3">
    <div class="col-12 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
            <h1 class="h3 mb-0"><i class="bi bi-person-rolodex me-2"></i>Anagrafiche</h1>
            <div class="text-muted small">Fornitori e clienti -- chi paga, chi ricevi.</div>
        </div>
        <div class="d-flex gap-2 align-items-center flex-wrap">
            <span id="contacts-count" class="badge bg-secondary">—</span>
            <button type="button" id="contacts-merge-btn" class="btn btn-warning btn-sm d-none" data-action="merge-open">
                <i class="bi bi-bezier2 me-1"></i>Fondi <span data-merge-count>0</span>
            </button>
            <button type="button" id="contacts-dedup-btn" class="btn btn-outline-warning btn-sm" data-action="dedup-open">
                <i class="bi bi-search me-1"></i>Trova doppioni
            </button>
            <button type="button" class="btn btn-primary btn-sm" data-action="new">
                <i class="bi bi-plus-circle me-1"></i>Nuova anagrafica
            </button>
        </div>
    </div>
</div>

<div class="card shadow-sm mb-3">
    <div class="card-body py-2">
        <div class="row g-2 align-items-end">
            <div class="col-12 col-md-9">
                <label class="form-label small mb-1">Cerca</label>
                <input type="text" id="filter-search" class="form-control form-control-sm" placeholder="Nome / P.IVA / IBAN / email">
            </div>
            <div class="col-12 col-md-3 text-md-end">
                <div class="form-check d-inline-block">
                    <input class="form-check-input" type="checkbox" id="filter-archived">
                    <label class="form-check-label small" for="filter-archived">Mostra archiviati</label>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
                <thead class="table-light">
                    <tr>
                        <th style="width:1%">
                            <input type="checkbox" id="contacts-select-all" class="form-check-input" title="Seleziona / deseleziona tutta la pagina">
                        </th>
                        <th style="width:1%"></th>
                        <th>Nome</th>
                        <th class="text-end">Spese (anno)</th>
                        <th class="text-end">Entrate (anno)</th>
                        <th class="text-end">Saldo netto</th>
                        <th>P.IVA</th>
                        <th class="text-end" style="width:1%">Azioni</th>
                    </tr>
                </thead>
                <tbody id="contacts-tbody">
                    <tr><td colspan="8" class="text-center text-muted py-4">
                        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
                    </td></tr>
                </tbody>
            </table>
        </div>
        <div id="contacts-empty" class="p-4 text-center text-muted d-none">
            <i class="bi bi-inbox fs-3 d-block mb-2"></i>
            Nessuna anagrafica.
        </div>
        <nav id="contacts-pager" class="px-3 py-2 border-top"></nav>
    </div>
</div>

<dialog id="contact-modal" class="border-0 rounded-3 shadow p-0" style="max-width: 720px; width: 95%">
    <form id="contact-form" method="dialog" class="m-0">
        ${csrfField(csrfToken)}        <input type="hidden" name="id">
        <input type="hidden" name="archived" value="0">
        <div class="modal-content border-0">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-person-rolodex me-2"></i>
                    <span data-mode-label>Nuova anagrafica</span>
                </h5>
                <button type="button" class="btn-close" data-action="close"></button>
            </div>
            <div class="modal-body">
                <div class="row g-2">
                    <div class="col-md-9">
                        <label class="form-label small mb-1">Nome *</label>
                        <input type="text" name="name" class="form-control" required maxlength="120" placeholder="Es: Enel Energia, Mario Rossi">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-1">Colore</label>
                        <input type="color" name="color" class="form-control form-control-color" value="#6c757d">
                    </div>
                    <input type="hidden" name="type" value="both">
                    <div class="col-md-6">
                        <label class="form-label small mb-1">P.IVA / CF</label>
                        <input type="text" name="vat_number" class="form-control" maxlength="32">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">IBAN</label>
                        <input type="text" name="iban" class="form-control" maxlength="40" placeholder="IT60 X054 …">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">Email</label>
                        <input type="email" name="email" class="form-control" maxlength="120">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1">Note</label>
                        <input type="text" name="notes" class="form-control">
                    </div>
                </div>
            </div>
            <div class="modal-footer justify-content-between">
                <button type="button" class="btn btn-outline-warning" data-action="archive">
                    <i class="bi bi-archive me-1"></i><span data-archive-label>Archivia</span>
                </button>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-secondary" data-action="close">Annulla</button>
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-check-circle me-1"></i>Salva
                    </button>
                </div>
            </div>
        </div>
    </form>
</dialog>

<dialog id="merge-modal" class="border-0 rounded-3 shadow p-0" style="max-width:680px; width:95%">
    <form id="merge-form" method="dialog" class="m-0">
        ${csrfField(csrfToken)}        <div class="modal-content border-0">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-bezier2 me-2"></i>Fondi anagrafiche</h5>
                <button type="button" class="btn-close" data-action="merge-close"></button>
            </div>
            <div class="modal-body">
                <p class="small text-muted mb-2">
                    Tutte le spese, entrate e ricorrenti collegate alle anagrafiche
                    <strong>perdenti</strong> verranno spostate sulla <strong>vincitrice</strong> selezionata.
                    Le perdenti vengono poi cancellate. L'operazione e' transazionale.
                </p>
                <div class="alert alert-warning small mb-2">
                    <i class="bi bi-exclamation-triangle me-1"></i>
                    Operazione irreversibile. I movimenti restano (cambia solo il riferimento contatto).
                </div>
                <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th style="width:1%">Vincitore</th>
                                <th>Nome</th>
                                <th class="text-end">Movimenti</th>
                            </tr>
                        </thead>
                        <tbody id="merge-candidates"></tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-action="merge-close">Annulla</button>
                <button type="submit" class="btn btn-warning" data-action="merge-submit" disabled>
                    <i class="bi bi-bezier2 me-1"></i>Fondi
                </button>
            </div>
        </div>
    </form>
</dialog>

<dialog id="dedup-modal" class="border-0 rounded-3 shadow p-0" style="max-width:760px; width:95%">
    <div class="modal-content border-0">
        <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-search me-2"></i>Doppioni da unire</h5>
            <button type="button" class="btn-close" data-action="dedup-close"></button>
        </div>
        <div class="modal-body">
            <p class="small text-muted mb-3">
                Nomi che sembrano la stessa cosa scritta in due modi. Per ogni gruppo scegli
                il nome da tenere e premi «Unisci»: i movimenti degli altri passano su quello,
                e gli altri spariscono. Se un gruppo non ti convince, lascialo stare.
            </p>
            <div id="dedup-groups">
                <div class="text-center text-muted py-4">
                    <div class="spinner-border spinner-border-sm me-2"></div>Sto cercando…
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-action="dedup-close">Chiudi</button>
        </div>
    </div>
</dialog>

<script type="module" src="${asset('js/pages/contacts.js')}"></script>
`;
