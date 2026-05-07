<?php
/**
 * Impostazioni — al momento ospita esclusivamente la "Zona pericolosa"
 * con il flusso di reset del database (movimenti / ricorrenti / tutto).
 *
 * Il flusso è gated client-side da: backup ZIP scaricato + frase
 * "ELIMINA TUTTO" digitata + password reinserita. Server-side la stessa
 * tripla viene rivalidata in public/endpoints/db_reset.php.
 */

use App\Config;

$base = rtrim(Config::get('app')['base_url'] ?? '', '/');
?>
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-gear me-2"></i>Impostazioni</h1>
        <div class="text-muted small">Manutenzione e azioni amministrative del tuo profilo.</div>
    </div>
</div>

<div class="row g-3">
    <div class="col-12 col-lg-8">
        <div class="card shadow-sm border-danger">
            <div class="card-header bg-danger text-white">
                <i class="bi bi-exclamation-octagon me-2"></i><strong>Zona pericolosa — Reset database</strong>
            </div>
            <div class="card-body">
                <p class="mb-2">
                    Cancella i tuoi dati in modo <strong>irreversibile</strong>. L'utente di login
                    e la tua password restano sempre intatti.
                </p>
                <p class="text-muted small mb-3">
                    Per procedere devi: 1) scaricare il backup completo, 2) scegliere l'ambito,
                    3) digitare la frase di conferma esatta, 4) reinserire la password.
                </p>

                <!-- Step 1: scope -->
                <div class="mb-3">
                    <label class="form-label fw-semibold mb-2">1. Cosa vuoi cancellare?</label>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="reset-scope" id="scope-movements" value="movements" checked>
                        <label class="form-check-label" for="scope-movements">
                            <strong>Solo movimenti</strong>
                            <div class="text-muted small">
                                Cancella spese, entrate, allegati, tag assegnati. Mantiene categorie,
                                conti, budget, ricorrenti e filtri salvati.
                            </div>
                        </label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="reset-scope" id="scope-movements-recurring" value="movements_recurring">
                        <label class="form-check-label" for="scope-movements-recurring">
                            <strong>Movimenti + reset ricorrenti</strong>
                            <div class="text-muted small">
                                Come sopra, ma azzera anche la cronologia di generazione delle spese
                                ricorrenti (ripartono da capo).
                            </div>
                        </label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="reset-scope" id="scope-all" value="all">
                        <label class="form-check-label" for="scope-all">
                            <strong>Reset totale (tabula rasa)</strong>
                            <div class="text-muted small">
                                Cancella TUTTO: movimenti, categorie, conti, tag, budget, ricorrenti,
                                filtri. Resta solo l'utente di login.
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Step 2: backup -->
                <div class="mb-3">
                    <label class="form-label fw-semibold mb-2">2. Scarica backup completo</label>
                    <div class="d-flex align-items-center gap-2">
                        <a id="btn-download-backup"
                           href="<?= htmlspecialchars($base . '/backup/download', ENT_QUOTES, 'UTF-8') ?>"
                           class="btn btn-outline-primary"
                           target="_blank" rel="noopener">
                            <i class="bi bi-cloud-download me-1"></i>Scarica backup ZIP
                        </a>
                        <span id="backup-status" class="small text-muted">
                            <i class="bi bi-info-circle me-1"></i>Obbligatorio prima del reset.
                        </span>
                    </div>
                </div>

                <!-- Step 3: phrase -->
                <div class="mb-3">
                    <label for="reset-phrase" class="form-label fw-semibold mb-2">
                        3. Digita la frase di conferma
                    </label>
                    <input type="text"
                           id="reset-phrase"
                           class="form-control font-monospace"
                           autocomplete="off"
                           spellcheck="false"
                           placeholder="ELIMINA TUTTO">
                    <div class="form-text">Esattamente così, in maiuscolo, senza apici.</div>
                </div>

                <!-- Step 4: password -->
                <div class="mb-3">
                    <label for="reset-password" class="form-label fw-semibold mb-2">
                        4. Reinserisci la password
                    </label>
                    <input type="password"
                           id="reset-password"
                           class="form-control"
                           autocomplete="current-password">
                </div>

                <button id="btn-reset" type="button" class="btn btn-danger" disabled>
                    <i class="bi bi-trash3 me-1"></i>Esegui reset
                </button>
                <div id="reset-hint" class="form-text mt-2">
                    Il bottone si abilita quando hai scaricato il backup, scelto un ambito,
                    digitato la frase e inserito la password.
                </div>
            </div>
        </div>
    </div>

    <div class="col-12 col-lg-8">
        <div class="card shadow-sm border-warning">
            <div class="card-header bg-warning text-dark">
                <i class="bi bi-arrow-counterclockwise me-2"></i><strong>Ripristina backup</strong>
            </div>
            <div class="card-body">
                <p class="mb-2">
                    Carica un backup ZIP (o file SQL) precedentemente scaricato per
                    <strong>sovrascrivere</strong> i tuoi dati attuali. Le tue credenziali di
                    login restano invariate.
                </p>
                <p class="text-muted small mb-3">
                    Tutti i tuoi dati attuali (movimenti, categorie, conti, budget, ricorrenti,
                    tag, filtri, allegati) verranno cancellati e sostituiti dal contenuto del
                    backup.
                </p>

                <!-- Step 1: file -->
                <div class="mb-3">
                    <label for="restore-file" class="form-label fw-semibold mb-2">
                        1. Scegli il file di backup
                    </label>
                    <input type="file"
                           id="restore-file"
                           class="form-control"
                           accept=".zip,.sql">
                    <div class="form-text">Accettati: .zip (con allegati) o .sql (solo dati). Max 64 MB.</div>
                </div>

                <!-- Step 2: phrase -->
                <div class="mb-3">
                    <label for="restore-phrase" class="form-label fw-semibold mb-2">
                        2. Digita la frase di conferma
                    </label>
                    <input type="text"
                           id="restore-phrase"
                           class="form-control font-monospace"
                           autocomplete="off"
                           spellcheck="false"
                           placeholder="RIPRISTINA BACKUP">
                    <div class="form-text">Esattamente così, in maiuscolo, senza apici.</div>
                </div>

                <!-- Step 3: password -->
                <div class="mb-3">
                    <label for="restore-password" class="form-label fw-semibold mb-2">
                        3. Reinserisci la password
                    </label>
                    <input type="password"
                           id="restore-password"
                           class="form-control"
                           autocomplete="current-password">
                </div>

                <button id="btn-restore" type="button" class="btn btn-warning" disabled>
                    <i class="bi bi-arrow-counterclockwise me-1"></i>Ripristina backup
                </button>
                <div id="restore-hint" class="form-text mt-2">
                    Il bottone si abilita quando hai scelto un file, digitato la frase e
                    inserito la password.
                </div>
            </div>
        </div>
    </div>
</div>

<script type="module" src="<?= $asset('js/pages/settings.js') ?>"></script>
