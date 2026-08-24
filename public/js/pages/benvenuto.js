// La procedura di primo avvio: un passo alla volta, senza ricaricare la pagina.
//
// I passi sono tutti nel markup; qui si decide quali accendere, a seconda di
// dove eravamo rimasti (`data-modo`).

const $ = (id) => document.getElementById(id);
const radice = $('benvenuto');
const csrf = radice.querySelector('[name="_csrf"]').value;

const PASSI = {
    'nuovo': ['password', 'recupero', 'persona', 'conto'],
    'da-proteggere': ['password', 'recupero'],
    'da-configurare': ['persona', 'conto'],
};

const coda = [...(PASSI[radice.dataset.modo] ?? PASSI.nuovo)];
let corrente = null;

function mostra(nome) {
    for (const s of radice.querySelectorAll('.mx-passo')) s.hidden = s.dataset.passo !== nome;
    corrente = nome;
    radice.querySelector(`[data-passo="${nome}"] input, [data-passo="${nome}"] button`)?.focus();
}

/** Il passo successivo, o la fine della procedura. */
function avanti() {
    coda.shift();
    if (coda.length) return mostra(coda[0]);
    // Chi doveva solo cifrare un database che c'era già non ha niente da
    // configurare: la sua roba è tutta al suo posto.
    window.location.href = '/dashboard';
}

async function chiama(url, dati, boxErrore) {
    boxErrore?.classList.add('d-none');
    const risposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...dati, _csrf: csrf }),
    });
    const esito = await risposta.json();
    if (!esito.ok) {
        const messaggio = esito.error?.message ?? 'Qualcosa non ha funzionato.';
        if (boxErrore) {
            boxErrore.textContent = messaggio;
            boxErrore.classList.remove('d-none');
        }
        throw new Error(messaggio);
    }
    return esito.data;
}

// ── Passo 1: la password ────────────────────────────────────────────────────
$('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errore = $('errore-password');
    const pw = $('password').value;

    if (pw !== $('password2').value) {
        errore.textContent = 'Le due password non sono uguali.';
        errore.classList.remove('d-none');
        return;
    }

    const btn = $('btn-password');
    btn.disabled = true;
    // Derivare la chiave costa qualche decimo di secondo apposta: è quello che
    // rende inutile provare le password a raffica. Va detto, o sembra bloccata.
    btn.textContent = 'Preparo la cifratura…';
    try {
        const dati = await chiama('/sicurezza/proteggi', { password: pw }, errore);
        $('chiave-recupero').textContent = dati.chiaveRecupero;
        avanti();
    } catch {
        // Il messaggio è già a video.
    } finally {
        btn.disabled = false;
        btn.textContent = 'Continua';
    }
});

// ── Passo 2: la chiave di recupero ──────────────────────────────────────────
$('salvata').addEventListener('change', (e) => { $('btn-recupero').disabled = !e.target.checked; });

$('btn-copia').addEventListener('click', async (e) => {
    try {
        await navigator.clipboard.writeText($('chiave-recupero').textContent.trim());
        e.currentTarget.innerHTML = '<i class="bi bi-check2 me-1"></i>Copiata';
    } catch {
        e.currentTarget.textContent = 'Copiala a mano';
    }
});

$('btn-recupero').addEventListener('click', avanti);

// ── Passo 3: chi sei ────────────────────────────────────────────────────────
const scelta = $('base-currency');
const altra = $('base-currency-altra');

scelta.addEventListener('change', () => {
    const libera = scelta.value === 'altra';
    altra.classList.toggle('d-none', !libera);
    altra.required = libera;
    if (libera) altra.focus();
});

const valutaPrincipale = () => (scelta.value === 'altra'
    ? altra.value.trim().toUpperCase()
    : scelta.value);

let persona = null;

$('form-persona').addEventListener('submit', (e) => {
    e.preventDefault();
    const errore = $('errore-persona');
    const base = valutaPrincipale();
    if (!/^[A-Z]{3}$/.test(base)) {
        errore.textContent = 'La valuta è una sigla di tre lettere, per esempio EUR.';
        errore.classList.remove('d-none');
        return;
    }
    persona = { username: $('username').value.trim(), base_currency: base };
    // Il conto sta quasi sempre nella stessa valuta: proporla evita di
    // chiederla due volte a chi ne ha una sola.
    $('conto-valuta').value = base;
    avanti();
});

// ── Passo 4: il primo conto ─────────────────────────────────────────────────
$('form-conto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errore = $('errore-conto');
    const btn = $('btn-conto');
    btn.disabled = true;
    try {
        await chiama('/sicurezza/completa', {
            ...persona,
            conto_nome: $('conto-nome').value.trim(),
            conto_tipo: $('conto-tipo').value,
            conto_valuta: $('conto-valuta').value.trim().toUpperCase(),
            conto_saldo: $('conto-saldo').value,
        }, errore);
        window.location.href = '/dashboard';
    } catch {
        btn.disabled = false;
    }
});

mostra(coda[0]);
