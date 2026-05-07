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
