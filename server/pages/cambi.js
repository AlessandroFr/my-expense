// I cambi fra le valute.
//
// La pagina esiste solo per chi ha un conto in una valuta diversa da quella
// principale: a chi ha tutto in una valuta sola dice esattamente questo, e
// smette lì.

import { asset, csrfField, esc } from '../view.js';

export const render = ({ csrfToken, baseCurrency = 'EUR', perno = 'EUR', today }) => `
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-currency-exchange me-2"></i>Cambi</h1>
        <div class="text-muted small">
            Servono a mostrare in ${esc(baseCurrency)} i movimenti dei conti in un'altra valuta.
        </div>
    </div>
</div>

<div class="card shadow-sm mb-3">
    <div class="card-body d-flex flex-wrap align-items-center gap-2">
        <div class="flex-grow-1">
            <div class="fw-semibold">Valuta principale</div>
            <div class="text-muted small">
                È quella in cui leggi i totali generali. Cambiarla rifà i conti a tutti i movimenti.
            </div>
        </div>
        <form id="form-principale" class="d-flex gap-2" autocomplete="off">
            ${csrfField(csrfToken)}
            <input type="text" class="form-control text-uppercase" id="p-valuta" maxlength="3"
                   style="width:6rem" value="${esc(baseCurrency)}" required>
            <button type="submit" class="btn btn-outline-primary">Cambia</button>
        </form>
    </div>
</div>

<div class="alert alert-info d-none" id="niente-da-fare">
    <i class="bi bi-info-circle me-1"></i>
    Tutti i tuoi conti sono in ${esc(baseCurrency)}: non serve nessun cambio.
    Se un giorno apri un conto in un'altra valuta, i cambi si impostano qui.
</div>

<div id="zona-cambi" class="d-none">

    <div class="alert alert-warning d-none" id="scoperti"></div>

    <div class="row g-3">
        <div class="col-12 col-lg-5">
            <div class="card shadow-sm mb-3">
                <div class="card-header"><i class="bi bi-cloud-download me-2"></i><strong>Scarica i cambi</strong></div>
                <div class="card-body">
                    <p class="text-muted small">
                        Li prende da Internet, dal giorno del tuo movimento più vecchio a oggi.
                        Parte solo quando lo chiedi tu, e non tocca i cambi che hai scritto a mano.
                    </p>
                    <button type="button" class="btn btn-primary w-100" id="btn-scarica">
                        <i class="bi bi-cloud-download me-1"></i>Scarica
                    </button>
                    <div class="mt-2 small" id="esito-scarico"></div>
                </div>
            </div>

            <div class="card shadow-sm">
                <div class="card-header"><i class="bi bi-pencil me-2"></i><strong>Scrivi un cambio</strong></div>
                <div class="card-body">
                    <p class="text-muted small">
                        Quante unità di quella valuta per 1 ${esc(perno)}.
                        Un cambio scritto a mano vince su quello scaricato.
                    </p>
                    <form id="form-cambio" autocomplete="off">
                        ${csrfField(csrfToken)}
                        <div class="row g-2">
                            <div class="col-5">
                                <label class="form-label small mb-1" for="c-valuta">Valuta</label>
                                <input type="text" class="form-control text-uppercase" id="c-valuta" maxlength="3" required>
                            </div>
                            <div class="col-7">
                                <label class="form-label small mb-1" for="c-data">Data</label>
                                <input type="date" class="form-control" id="c-data" value="${esc(today)}" max="${esc(today)}" required>
                            </div>
                            <div class="col-12">
                                <label class="form-label small mb-1" for="c-rate">
                                    Quante ne fa 1 ${esc(perno)}
                                </label>
                                <input type="text" class="form-control" id="c-rate" inputmode="decimal"
                                       placeholder="per esempio 0,96" required>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-outline-primary w-100 mt-3">Salva</button>
                    </form>
                    <hr>
                    <button type="button" class="btn btn-outline-secondary btn-sm w-100" id="btn-ricalcola">
                        <i class="bi bi-arrow-repeat me-1"></i>Rifà i conti a tutti i movimenti
                    </button>
                </div>
            </div>
        </div>

        <div class="col-12 col-lg-7">
            <div class="card shadow-sm">
                <div class="card-header d-flex align-items-center">
                    <strong class="flex-grow-1">Cambi conosciuti</strong>
                    <select class="form-select form-select-sm w-auto" id="filtro-valuta">
                        <option value="">Tutte le valute</option>
                    </select>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Data</th><th>Valuta</th>
                                <th class="text-end">Per 1 ${esc(perno)}</th>
                                <th>Da dove</th><th></th>
                            </tr>
                        </thead>
                        <tbody id="righe-cambi"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

</div>

<script type="module" src="${asset('js/pages/cambi.js')}"></script>
`;
