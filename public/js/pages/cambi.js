// ─── pages/cambi.js ──────────────────────────────────────────────────────────
// I cambi: elenco, inserimento a mano, scarico da Internet.

import FetchRequest from '../FetchRequest.js';
import { apiSend, confirmDialog, escapeHtml } from '../componentBase.js';
import { fmtDate, fmtNum } from '../format.js';
import { toast } from '../toast.js';

const api = FetchRequest.getInstance();
const send = apiSend(api);

const $ = (id) => document.getElementById(id);
const righe = $('righe-cambi');
const filtro = $('filtro-valuta');
const scoperti = $('scoperti');

let valuteNote = [];

/** Quanti movimenti sono rimasti senza controvalore, e in che valuta. */
function mostraScoperti(elenco) {
    if (!elenco?.length) {
        scoperti.classList.add('d-none');
        return;
    }
    const pezzi = elenco.map((s) => `${s.movimenti} in ${escapeHtml(s.valuta)}`).join(', ');
    scoperti.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>`
        + `Ci sono movimenti senza cambio (${pezzi}): nei totali generali contano `
        + `per il numero della loro valuta, che non è convertito. Scarica o scrivi i cambi mancanti.`;
    scoperti.classList.remove('d-none');
}

function disegna(rates) {
    if (!rates.length) {
        righe.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nessun cambio ancora.</td></tr>';
        return;
    }
    righe.innerHTML = rates.map((r) => `
        <tr>
            <td>${fmtDate(r.rate_date)}</td>
            <td><strong>${escapeHtml(r.quote)}</strong></td>
            <td class="text-end font-monospace">${fmtNum(r.rate, 6)}</td>
            <td class="small text-muted">${r.source === 'manual' ? 'scritto a mano' : 'da Internet'}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" data-elimina="${r.id}" title="Elimina">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`).join('');
}

async function ricarica() {
    const r = await api.get('/cambi/list', filtro.value ? { quote: filtro.value } : {});
    if (r?.ok === false) {
        toast.error(r.error?.message ?? 'Non riesco a leggere i cambi.');
        return;
    }
    const d = r.data;

    // Senza conti in un'altra valuta non c'è niente da impostare, e dirlo è
    // più utile che mostrare una tabella vuota.
    const serve = d.valute.length > 0;
    $('zona-cambi').classList.toggle('d-none', !serve);
    $('niente-da-fare').classList.toggle('d-none', serve);
    if (!serve) return;

    if (valuteNote.join() !== d.valute.join()) {
        valuteNote = d.valute;
        filtro.innerHTML = '<option value="">Tutte le valute</option>'
            + d.valute.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    }
    mostraScoperti(d.scoperti);
    disegna(d.rates);
}

filtro.addEventListener('change', ricarica);

$('form-cambio').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const r = await send('/cambi/save', {
            quote: $('c-valuta').value.trim().toUpperCase(),
            rate_date: $('c-data').value,
            rate: $('c-rate').value,
        });
        $('c-rate').value = '';
        toast.success(r.data.sistemati
            ? `Cambio salvato: ${r.data.sistemati} movimenti rifatti.`
            : 'Cambio salvato.');
        await ricarica();
    } catch (err) {
        toast.error(err.message ?? 'Non è stato possibile salvare il cambio.');
    }
});

righe.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-elimina]');
    if (!btn) return;

    const ok = await confirmDialog(
        'I movimenti che usavano questo cambio verranno rifatti con il cambio più vicino che resta. Procedere?',
        { title: 'Elimina cambio', confirmText: 'Sì, elimina', confirmClass: 'btn-danger' },
    );
    if (!ok) return;

    try {
        await send('/cambi/delete', { id: btn.dataset.elimina });
        toast.success('Cambio eliminato.');
        await ricarica();
    } catch (err) {
        toast.error(err.message ?? 'Non è stato possibile eliminare il cambio.');
    }
});

$('btn-scarica').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Scarico…';
    try {
        const r = await send('/cambi/scarica', filtro.value ? { quote: filtro.value } : {});
        $('esito-scarico').innerHTML = r.data.esito.map((x) => (x.errore
            ? `<div class="text-danger">${escapeHtml(x.valuta)}: ${escapeHtml(x.errore)}</div>`
            : `<div class="text-success">${escapeHtml(x.valuta)}: ${x.nuovi} cambi nuovi</div>`)).join('');
        if (r.data.sistemati) toast.success(`${r.data.sistemati} movimenti rifatti.`);
        await ricarica();
    } catch (err) {
        toast.error(err.message ?? 'Lo scarico non è riuscito.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-cloud-download me-1"></i>Scarica';
    }
});

$('btn-ricalcola').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
        const r = await send('/cambi/ricalcola', {});
        toast.success(`${r.data.sistemati} movimenti rifatti.`);
        await ricarica();
    } catch (err) {
        toast.error(err.message ?? 'Il ricalcolo non è riuscito.');
    } finally {
        e.currentTarget.disabled = false;
    }
});

ricarica();

// ─── La valuta principale ────────────────────────────────────────────────────
// Cambiarla non e' una preferenza di visualizzazione: rifa' il controvalore di
// ogni movimento, perche' in un'altra valuta nessuno di quei numeri vale piu'.

$('form-principale').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuova = $('p-valuta').value.trim().toUpperCase();

    const ok = await confirmDialog(
        `Da adesso i totali generali si leggono in ${nuova}, e il controvalore di ogni `
        + 'movimento viene rifatto. Procedere?',
        { title: 'Cambia valuta principale', confirmText: 'Sì, cambia' },
    );
    if (!ok) return;

    try {
        const r = await send('/cambi/principale', { base_currency: nuova });
        toast.success(`Adesso i totali sono in ${nuova} (${r.data.sistemati} movimenti rifatti).`);
        // La valuta principale sta nel body di ogni pagina e la legge fmtMoney:
        // ricaricare e' l'unico modo perche' la veda anche il resto dell'app.
        setTimeout(() => window.location.reload(), 900);
    } catch (err) {
        toast.error(err.message ?? 'Non è stato possibile cambiare la valuta principale.');
    }
});
