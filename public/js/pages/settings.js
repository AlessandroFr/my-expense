// ─── pages/settings.js ───────────────────────────────────────────────────────
// Zona pericolosa: flusso 4-step (backup -> scope -> frase -> password) per
// resettare il DB scoped sull'utente loggato. Il bottone "Esegui reset" rimane
// disabilitato finché tutti gli step non sono stati soddisfatti, e una conferma
// extra (confirmDialog) precede l'invio della richiesta.

import FetchRequest          from '../FetchRequest.js';
import { apiSend, confirmDialog } from '../componentBase.js';
import { toast }             from '../toast.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const REQUIRED_PHRASE = 'ELIMINA TUTTO';

const btnBackup   = document.getElementById('btn-download-backup');
const backupHint  = document.getElementById('backup-status');
const phraseInput = document.getElementById('reset-phrase');
const pwdInput    = document.getElementById('reset-password');
const btnReset    = document.getElementById('btn-reset');
const scopeRadios = document.querySelectorAll('input[name="reset-scope"]');

// Flag in-memory: true solo se l'utente ha cliccato "Scarica backup" in questa
// sessione di pagina. Si perde al reload — by design (vogliamo che riscarichi).
let backupClicked = false;

function getScope() {
    for (const r of scopeRadios) if (r.checked) return r.value;
    return null;
}

function refreshButtonState() {
    const phraseOk = phraseInput.value === REQUIRED_PHRASE;
    const pwdOk    = pwdInput.value.length > 0;
    const scopeOk  = getScope() !== null;
    btnReset.disabled = !(backupClicked && phraseOk && pwdOk && scopeOk);
}

btnBackup.addEventListener('click', () => {
    // L'utente apre /backup/download in una nuova tab (download server-side).
    // Non possiamo verificare l'effettivo completamento del download, ma il
    // click qui significa che il file è stato richiesto: lo accettiamo come
    // conferma intenzionale.
    backupClicked = true;
    backupHint.innerHTML = '<i class="bi bi-check-circle text-success me-1"></i>Backup richiesto — controlla la tab nuova.';
    refreshButtonState();
});

phraseInput.addEventListener('input', refreshButtonState);
pwdInput.addEventListener('input', refreshButtonState);
scopeRadios.forEach(r => r.addEventListener('change', refreshButtonState));

btnReset.addEventListener('click', async () => {
    const scope = getScope();
    if (!scope) return;

    const labels = {
        movements:           'Solo movimenti',
        movements_recurring: 'Movimenti + reset ricorrenti',
        all:                 'RESET TOTALE (tabula rasa)',
    };
    const ok = await confirmDialog(
        `Stai per eseguire: ${labels[scope]}. L'operazione è irreversibile. Procedere?`,
        { title: 'Conferma reset', confirmText: 'Sì, cancella', confirmClass: 'btn-danger' }
    );
    if (!ok) return;

    btnReset.disabled = true;
    btnReset.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Reset in corso...';

    try {
        const r = await send(`${BASE}/db/reset`, {
            scope,
            confirm_phrase: phraseInput.value,
            password:       pwdInput.value,
        });
        const c = (r && r.data && r.data.counters) || {};
        const expenses = Number(c.expenses_deleted) || 0;
        const incomes  = Number(c.incomes_deleted)  || 0;
        toast.success(`Reset completato: ${expenses} spese, ${incomes} entrate cancellate.`);

        // Ricarica dashboard: i widget devono mostrare lo stato pulito.
        setTimeout(() => { window.location.href = `${BASE}/dashboard`; }, 900);
    } catch (err) {
        toast.error(err.message ?? 'Errore durante il reset.');
        btnReset.disabled = false;
        btnReset.innerHTML = '<i class="bi bi-trash3 me-1"></i>Esegui reset';
        refreshButtonState();
    }
});

// ─── Restore backup ──────────────────────────────────────────────────────────
// Carica un backup .zip o .sql, riautentica con frase + password, l'endpoint
// fa wipe + re-INSERT in transazione. UX speculare a quella del reset.

const RESTORE_PHRASE = 'RIPRISTINA BACKUP';

const fileInput   = document.getElementById('restore-file');
const phraseR     = document.getElementById('restore-phrase');
const pwdR        = document.getElementById('restore-password');
const btnRestore  = document.getElementById('btn-restore');

function refreshRestoreState() {
    const fileOk   = fileInput.files && fileInput.files.length === 1;
    const phraseOk = phraseR.value.trim() === RESTORE_PHRASE;
    const pwdOk    = pwdR.value.length > 0;
    btnRestore.disabled = !(fileOk && phraseOk && pwdOk);
}

fileInput.addEventListener('change', refreshRestoreState);
phraseR.addEventListener('input',   refreshRestoreState);
pwdR.addEventListener('input',      refreshRestoreState);

btnRestore.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const ok = await confirmDialog(
        `Tutti i tuoi dati attuali verranno cancellati e sostituiti dal contenuto di "${file.name}". Procedere?`,
        { title: 'Conferma ripristino', confirmText: 'Sì, ripristina', confirmClass: 'btn-warning' }
    );
    if (!ok) return;

    btnRestore.disabled = true;
    const origLabel = btnRestore.innerHTML;
    btnRestore.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Ripristino in corso...';

    try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('confirm_phrase', phraseR.value.trim());
        fd.append('password', pwdR.value);

        const r = await api.postFormData(`${BASE}/backup/restore`, fd);
        if (r && r.ok === false) {
            throw new Error(r.error?.message ?? 'Errore durante il ripristino.');
        }

        const d = (r && r.data) || {};
        const totalRows = Object.values(d.rows_per_table || {})
            .reduce((acc, n) => acc + (Number(n) || 0), 0);
        const filesN = Number(d.files_extracted) || 0;
        toast.success(`Ripristino completato: ${totalRows} righe, ${filesN} allegati.`);

        setTimeout(() => { window.location.href = `${BASE}/dashboard`; }, 900);
    } catch (err) {
        // postFormData lancia Error con .body (envelope JSON) sui non-2xx
        const msg = err?.body?.error?.message ?? err?.message ?? 'Errore durante il ripristino.';
        toast.error(msg);
        btnRestore.innerHTML = origLabel;
        refreshRestoreState();
    }
});
