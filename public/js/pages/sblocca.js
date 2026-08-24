// La schermata di sblocco.
//
// Niente FetchRequest qui: quella spawna un Worker per richiesta e serve a chi
// fa decine di chiamate. Qui ce n'è una sola, e a database chiuso più roba si
// carica più cose possono rompersi prima ancora di entrare.

const $ = (id) => document.getElementById(id);

const form = $('form-sblocco');
const errore = $('errore');
const btn = $('btn-sblocca');
const riquadroRecupero = $('riquadro-recupero');
const campoChiave = $('chiave');
const campoPassword = $('password');

function mostraErrore(testo) {
    errore.textContent = testo;
    errore.classList.remove('d-none');
}

$('btn-dimenticata').addEventListener('click', () => {
    riquadroRecupero.classList.remove('d-none');
    campoPassword.required = false;
    campoChiave.focus();
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errore.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Apro…';

    // Se la chiave di recupero è scritta vince lei: chi l'ha tirata fuori è
    // perché la password non ce l'ha.
    const segreto = campoChiave.value.trim() || campoPassword.value;

    try {
        const risposta = await fetch('/sicurezza/sblocca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                segreto,
                _csrf: form.querySelector('[name="_csrf"]').value,
            }),
        });
        const dati = await risposta.json();

        if (!dati.ok) {
            mostraErrore(dati.error?.message ?? 'Non si apre.');
            return;
        }
        // Entrato con la chiave di recupero: la password vecchia non la sa più
        // nessuno, quindi si passa dritti a sceglierne una nuova.
        window.location.href = dati.data.deveCambiarePassword
            ? '/settings?nuova-password=1'
            : '/dashboard';
        return;
    } catch (err) {
        mostraErrore(`Non riesco a parlare con l'app: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Apri';
    }
});
