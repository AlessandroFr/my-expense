import { asset, csrfField, esc } from '../view.js';

export const render = ({ csrfToken, copiaInChiaro }) => `
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-gear me-2"></i>Impostazioni</h1>
        <div class="text-muted small">Backup, password e manutenzione dei tuoi dati.</div>
    </div>
</div>

<ul class="nav mx-tabs" id="settings-tabs" role="tablist">
    <li class="nav-item" role="presentation">
        <button class="nav-link active" id="tab-backup-tab" data-bs-toggle="tab" data-bs-target="#tab-backup" type="button" role="tab" aria-selected="true">
            <i class="bi bi-cloud-download"></i><span>Backup</span>
        </button>
    </li>
    <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-restore-tab" data-bs-toggle="tab" data-bs-target="#tab-restore" type="button" role="tab" aria-selected="false">
            <i class="bi bi-arrow-counterclockwise"></i><span>Ripristina backup</span>
        </button>
    </li>
    <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-sicurezza-tab" data-bs-toggle="tab" data-bs-target="#tab-sicurezza" type="button" role="tab" aria-selected="false">
            <i class="bi bi-shield-lock"></i><span>Sicurezza</span>
        </button>
    </li>
    <li class="nav-item" role="presentation">
        <button class="nav-link" id="tab-reset-tab" data-bs-toggle="tab" data-bs-target="#tab-reset" type="button" role="tab" aria-selected="false">
            <i class="bi bi-trash3"></i><span>Reset database</span>
        </button>
    </li>
</ul>

<div class="tab-content">

<!-- ── Backup ─────────────────────────────────────────────────────────────── -->
<div class="tab-pane fade show active" id="tab-backup" role="tabpanel">
<div class="row g-3">
    <div class="col-12 col-lg-8">
        <div class="card shadow-sm">
            <div class="card-header"><i class="bi bi-cloud-download me-2"></i><strong>Scarica una copia dei tuoi dati</strong></div>
            <div class="card-body">
                <p class="mb-2">Il file contiene tutto: movimenti, conti, categorie, allegati.</p>
                <p class="text-muted small mb-3">
                    Esce cifrato con la tua password, come il database. Per riaprirlo servirà
                    la password che hai <strong>adesso</strong>: se un giorno la cambi, i backup
                    di prima continueranno a volere quella vecchia.
                </p>

                <form id="form-backup" method="post" action="/backup/download">
                    ${csrfField(csrfToken)}
                    <div class="mb-3">
                        <label for="backup-password" class="form-label fw-semibold">La tua password</label>
                        <input type="password" name="password" id="backup-password" class="form-control"
                               autocomplete="current-password" required>
                    </div>
                    <button type="submit" class="btn btn-primary" id="btn-download-backup">
                        <i class="bi bi-cloud-download me-1"></i>Scarica il backup
                    </button>
                    <span id="backup-status" class="small text-muted ms-2"></span>
                </form>
            </div>
        </div>
    </div>
</div>
</div>

<!-- ── Ripristino ─────────────────────────────────────────────────────────── -->
<div class="tab-pane fade" id="tab-restore" role="tabpanel">
<div class="row g-3">
    <div class="col-12 col-lg-8">
        <div class="card shadow-sm border-warning">
            <div class="card-header bg-warning text-dark">
                <i class="bi bi-arrow-counterclockwise me-2"></i><strong>Ripristina backup</strong>
            </div>
            <div class="card-body">
                <p class="mb-2">Carica un backup per <strong>sovrascrivere</strong> i tuoi dati attuali.</p>
                <p class="text-muted small mb-3">Tutti i tuoi dati attuali verranno cancellati e sostituiti dal contenuto del backup.</p>

                <div class="mb-3">
                    <label for="restore-file" class="form-label fw-semibold mb-2">1. Scegli il file di backup</label>
                    <input type="file" id="restore-file" class="form-control" accept=".mxb,.zip,.sql">
                    <div class="form-text">
                        Un file <code>.mxb</code>, oppure <code>.zip</code> e <code>.sql</code> se viene
                        da una versione precedente. Al massimo 64 MB.
                    </div>
                </div>

                <div class="mb-3">
                    <label for="restore-phrase" class="form-label fw-semibold mb-2">2. Digita la frase di conferma</label>
                    <input type="text" id="restore-phrase" class="form-control font-monospace" autocomplete="off" spellcheck="false" placeholder="RIPRISTINA BACKUP">
                    <div class="form-text">Esattamente così, in maiuscolo, senza apici.</div>
                </div>

                <div class="mb-3">
                    <label for="restore-password" class="form-label fw-semibold mb-2">3. La password del backup</label>
                    <input type="password" id="restore-password" class="form-control" autocomplete="current-password">
                    <div class="form-text">Quella che avevi quando hai fatto quel backup, non per forza quella di adesso.</div>
                </div>

                <button id="btn-restore" type="button" class="btn btn-warning" disabled>
                    <i class="bi bi-arrow-counterclockwise me-1"></i>Ripristina backup
                </button>
                <div id="restore-hint" class="form-text mt-2">Il bottone si abilita quando hai scelto un file, digitato la frase e inserito la password.</div>
            </div>
        </div>
    </div>
</div>
</div>

<!-- ── Sicurezza ──────────────────────────────────────────────────────────── -->
<div class="tab-pane fade" id="tab-sicurezza" role="tabpanel">
<div class="row g-3">
    <div class="col-12 col-lg-8">

        ${copiaInChiaro ? `
        <div class="alert alert-warning">
            <div class="fw-semibold mb-1"><i class="bi bi-exclamation-triangle me-1"></i>C'è ancora la copia di prima della cifratura</div>
            <p class="small mb-2">
                Quando i tuoi dati sono stati cifrati ne è stata tenuta una copia in chiaro, per sicurezza.
                Adesso che è andato tutto bene quella copia è l'unico file leggibile che ti resta:
                cancellala a mano.
            </p>
            <div class="small font-monospace text-break">${esc(copiaInChiaro)}</div>
        </div>` : ''}

        <div class="card shadow-sm mb-3">
            <div class="card-header"><i class="bi bi-key me-2"></i><strong>Cambia password</strong></div>
            <div class="card-body">
                <p class="text-muted small">
                    La chiave di recupero non cambia: continuerà a funzionare anche con la password nuova.
                </p>
                <form id="form-cambio-password" autocomplete="off">
                    ${csrfField(csrfToken)}
                    <div class="mb-3">
                        <label for="pw-vecchia" class="form-label">Password attuale</label>
                        <input type="password" id="pw-vecchia" class="form-control" autocomplete="current-password" required>
                    </div>
                    <div class="mb-3">
                        <label for="pw-nuova" class="form-label">Password nuova</label>
                        <input type="password" id="pw-nuova" class="form-control" autocomplete="new-password" minlength="8" required>
                        <div class="form-text">Almeno 8 caratteri.</div>
                    </div>
                    <div class="mb-3">
                        <label for="pw-nuova2" class="form-label">Riscrivila</label>
                        <input type="password" id="pw-nuova2" class="form-control" autocomplete="new-password" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Cambia password</button>
                </form>
            </div>
        </div>

        <div class="card shadow-sm">
            <div class="card-header"><i class="bi bi-life-preserver me-2"></i><strong>Chiave di recupero</strong></div>
            <div class="card-body">
                <p class="text-muted small">
                    Serve ad aprire i tuoi dati se dimentichi la password. Rigenerala se temi che
                    qualcun altro l'abbia vista: quella di prima smette di funzionare all'istante.
                </p>
                <div class="alert alert-warning d-none" id="chiave-nuova-riquadro">
                    <div class="fw-semibold mb-2">Scrivila su un foglio adesso — non te la ripetiamo più</div>
                    <div class="font-monospace fs-5 text-center py-2" id="chiave-nuova"></div>
                </div>
                <button type="button" class="btn btn-outline-secondary" id="btn-rigenera-chiave">
                    Genera una chiave nuova
                </button>
            </div>
        </div>

    </div>
</div>
</div>

<!-- ── Reset ──────────────────────────────────────────────────────────────── -->
<div class="tab-pane fade" id="tab-reset" role="tabpanel">
<div class="row g-3">
    <div class="col-12 col-lg-8">
        <div class="card shadow-sm border-danger">
            <div class="card-header bg-danger text-white">
                <i class="bi bi-exclamation-octagon me-2"></i><strong>Zona pericolosa — Reset database</strong>
            </div>
            <div class="card-body">
                <p class="mb-2">Cancella i tuoi dati in modo <strong>irreversibile</strong>.</p>
                <p class="text-muted small mb-3">Per procedere: 1) scarica il backup, 2) scegli l'ambito, 3) digita la frase, 4) reinserisci la password.</p>

                <div class="mb-3">
                    <label class="form-label fw-semibold mb-2">1. Cosa vuoi cancellare?</label>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="reset-scope" id="scope-movements" value="movements" checked>
                        <label class="form-check-label" for="scope-movements"><strong>Solo movimenti</strong></label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="reset-scope" id="scope-movements-recurring" value="movements_recurring">
                        <label class="form-check-label" for="scope-movements-recurring"><strong>Movimenti + reset ricorrenti</strong></label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="reset-scope" id="scope-all" value="all">
                        <label class="form-check-label" for="scope-all"><strong>Reset totale (tabula rasa)</strong></label>
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold mb-2">2. Scarica un backup completo</label>
                    <div class="d-flex align-items-center gap-2">
                        <button type="button" class="btn btn-outline-primary" id="btn-vai-backup">
                            <i class="bi bi-cloud-download me-1"></i>Vai al backup
                        </button>
                        <span id="reset-backup-status" class="small text-muted">
                            <i class="bi bi-info-circle me-1"></i>Obbligatorio prima del reset.
                        </span>
                    </div>
                </div>

                <div class="mb-3">
                    <label for="reset-phrase" class="form-label fw-semibold mb-2">3. Digita la frase di conferma</label>
                    <input type="text" id="reset-phrase" class="form-control font-monospace" autocomplete="off" spellcheck="false" placeholder="ELIMINA TUTTO">
                    <div class="form-text">Esattamente così, in maiuscolo, senza apici.</div>
                </div>

                <div class="mb-3">
                    <label for="reset-password" class="form-label fw-semibold mb-2">4. Reinserisci la password</label>
                    <input type="password" id="reset-password" class="form-control" autocomplete="current-password">
                </div>

                <button id="btn-reset" type="button" class="btn btn-danger" disabled>
                    <i class="bi bi-trash3 me-1"></i>Esegui reset
                </button>
                <div id="reset-hint" class="form-text mt-2">
                    Il bottone si abilita quando hai scaricato il backup, scelto un ambito, digitato la frase e inserito la password.
                </div>
            </div>
        </div>
    </div>
</div>
</div>

</div>

<script type="module" src="${asset('js/pages/settings.js')}"></script>
`;
