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

const formBackup  = document.getElementById('form-backup');
const backupHint  = document.getElementById('backup-status');
const phraseInput = document.getElementById('reset-phrase');
const pwdInput    = document.getElementById('reset-password');
const btnReset    = document.getElementById('btn-reset');
const scopeRadios = document.querySelectorAll('input[name="reset-scope"]');
const resetHint   = document.getElementById('reset-backup-status');

// Flag in-memory: true solo se l'utente ha chiesto il backup in questa
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

// Il backup è un submit normale: il file lo manda il server e lo scarica il
// browser. Niente blob da costruire, e la password non finisce in un indirizzo.
formBackup.addEventListener('submit', () => {
    backupClicked = true;
    backupHint.innerHTML = '<i class="bi bi-check-circle text-success me-1"></i>Scaricato.';
    resetHint.innerHTML = '<i class="bi bi-check-circle text-success me-1"></i>Backup richiesto.';
    refreshButtonState();
});

document.getElementById('btn-vai-backup').addEventListener('click', () => {
    document.getElementById('tab-backup-tab').click();
    document.getElementById('backup-password').focus();
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

// ─── Sicurezza ───────────────────────────────────────────────────────────────
// Cambio password e chiave di recupero. Il vault sta sul disco, non nel
// database: queste due cose non passano dal reset e non stanno nel backup.

const formCambio = document.getElementById('form-cambio-password');

formCambio.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuova = document.getElementById('pw-nuova').value;
    if (nuova !== document.getElementById('pw-nuova2').value) {
        toast.error('Le due password nuove non sono uguali.');
        return;
    }

    const btn = formCambio.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
        await send(`${BASE}/sicurezza/password`, {
            vecchia: document.getElementById('pw-vecchia').value,
            nuova,
        });
        formCambio.reset();
        toast.success('Password cambiata. La chiave di recupero è ancora quella di prima.');
    } catch (err) {
        toast.error(err.message ?? 'Non è stato possibile cambiare la password.');
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-rigenera-chiave').addEventListener('click', async (e) => {
    const ok = await confirmDialog(
        'La chiave di recupero che hai adesso smetterà di funzionare subito. '
        + 'Quella nuova va riscritta al posto della vecchia. Procedere?',
        { title: 'Nuova chiave di recupero', confirmText: 'Sì, generala' }
    );
    if (!ok) return;

    e.currentTarget.disabled = true;
    try {
        const r = await send(`${BASE}/sicurezza/chiave-recupero`, {});
        document.getElementById('chiave-nuova').textContent = r.data.chiaveRecupero;
        document.getElementById('chiave-nuova-riquadro').classList.remove('d-none');
    } catch (err) {
        toast.error(err.message ?? 'Non è stato possibile generare la chiave.');
        e.currentTarget.disabled = false;
    }
});

// Chi è entrato con la chiave di recupero arriva qui con ?nuova-password=1: la
// password vecchia non ce l'ha — è il motivo per cui ha usato la chiave — e
// chiedergliela sarebbe un vicolo cieco.
if (new URLSearchParams(location.search).has('nuova-password')) {
    document.getElementById('tab-sicurezza-tab').click();
    const vecchia = document.getElementById('pw-vecchia');
    vecchia.closest('.mb-3').hidden = true;
    vecchia.required = false;
    vecchia.value = '';
    formCambio.insertAdjacentHTML('afterbegin',
        '<div class="alert alert-info">Sei entrato con la chiave di recupero. '
        + 'Scegli una password nuova: da adesso userai quella.</div>');
    document.getElementById('pw-nuova').focus();
}
