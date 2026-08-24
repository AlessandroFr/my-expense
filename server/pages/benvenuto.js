// La procedura di primo avvio.
//
// Tre situazioni diverse, una pagina sola: chi parte da zero le vede tutte,
// chi aveva già un database in chiaro vede solo la parte della password, chi
// si è fermato a metà riprende da dove aveva lasciato. I passi sono nel markup
// e li accende il JS: a database chiuso non c'è niente da chiedere al server.

import { csrfField, esc } from '../view.js';

/** Le valute proposte per prime. Il resto si scrive a mano. */
const VALUTE = [
  ['EUR', 'Euro'],
  ['CHF', 'Franco svizzero'],
  ['USD', 'Dollaro americano'],
  ['GBP', 'Sterlina'],
];

const TIPI_CONTO = [
  ['checking', 'Conto corrente'],
  ['cash', 'Contanti'],
  ['card', 'Carta'],
  ['savings', 'Risparmio'],
  ['other', 'Altro'],
];

const opzioni = (voci, selezionata) => voci.map(([v, etichetta]) =>
  `<option value="${esc(v)}"${v === selezionata ? ' selected' : ''}>${esc(etichetta)} (${esc(v)})</option>`,
).join('');

export function render(d) {
  return `
<div class="card shadow-sm" id="benvenuto" data-modo="${esc(d.modo)}">
    <div class="card-body p-4">

        <!-- ── Password ─────────────────────────────────────────────────── -->
        <section class="mx-passo" data-passo="password" hidden>
            <h2 class="h5 mb-1">${d.modo === 'da-proteggere' ? 'Proteggi i tuoi dati' : 'Benvenuto'}</h2>
            <p class="text-body-secondary small">
                ${d.modo === 'da-proteggere'
    ? 'Da questa versione i tuoi dati vengono conservati cifrati. Scegli una password: '
      + 'da adesso servirà per aprire l\'app.'
    : 'Scegli una password. Serve ad aprire l\'app, e con quella i tuoi dati '
      + 'vengono conservati cifrati: senza, il file dei conti non si legge.'}
            </p>

            <form id="form-password" autocomplete="off">
                ${csrfField(d.csrfToken)}
                <div class="mb-3">
                    <label class="form-label" for="password">Password</label>
                    <input type="password" class="form-control" id="password"
                           autocomplete="new-password" minlength="8" required autofocus>
                    <div class="form-text">Almeno 8 caratteri. Una frase che ricordi è meglio di una parola corta e strana.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="password2">Riscrivila</label>
                    <input type="password" class="form-control" id="password2"
                           autocomplete="new-password" required>
                </div>
                <div class="alert alert-danger d-none" id="errore-password" role="alert"></div>
                <button type="submit" class="btn btn-primary w-100" id="btn-password">Continua</button>
            </form>
        </section>

        <!-- ── Chiave di recupero ───────────────────────────────────────── -->
        <section class="mx-passo" data-passo="recupero" hidden>
            <h2 class="h5 mb-1">La tua chiave di recupero</h2>
            <p class="text-body-secondary small">
                Se un giorno dimentichi la password, questa chiave è l'unico modo
                per riaprire i tuoi dati.
            </p>

            <div class="alert alert-warning">
                <div class="fw-semibold mb-2"><i class="bi bi-exclamation-triangle me-1"></i>Scrivila su un foglio adesso</div>
                <div class="font-monospace fs-5 text-center py-2" id="chiave-recupero">—</div>
                <button type="button" class="btn btn-sm btn-outline-secondary w-100" id="btn-copia">
                    <i class="bi bi-clipboard me-1"></i>Copia
                </button>
            </div>

            <p class="small text-body-secondary">
                Mettila insieme ai documenti, non nello stesso computer.
                Senza password e senza questa chiave i tuoi dati non si aprono più:
                non c'è nessun altro modo e non c'è nessuno a cui chiederla.
            </p>

            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="salvata">
                <label class="form-check-label" for="salvata">L'ho scritta e messa al sicuro</label>
            </div>
            <button type="button" class="btn btn-primary w-100" id="btn-recupero" disabled>Continua</button>
        </section>

        <!-- ── Chi sei ──────────────────────────────────────────────────── -->
        <section class="mx-passo" data-passo="persona" hidden>
            <h2 class="h5 mb-1">Come ti chiami</h2>
            <p class="text-body-secondary small">Serve solo a salutarti: resta sul tuo computer.</p>

            <form id="form-persona" autocomplete="off">
                ${csrfField(d.csrfToken)}
                <div class="mb-3">
                    <label class="form-label" for="username">Nome</label>
                    <input type="text" class="form-control" id="username" maxlength="60" required>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="base-currency">Valuta principale</label>
                    <select class="form-select" id="base-currency">
                        ${opzioni(VALUTE, 'EUR')}
                        <option value="altra">Un'altra…</option>
                    </select>
                    <input type="text" class="form-control mt-2 d-none text-uppercase" id="base-currency-altra"
                           maxlength="3" placeholder="Sigla di tre lettere, per esempio SEK">
                    <div class="form-text">
                        È la valuta in cui vuoi vedere i totali. Ogni conto può averne una diversa:
                        i totali generali vengono convertiti in questa.
                    </div>
                </div>
                <div class="alert alert-danger d-none" id="errore-persona" role="alert"></div>
                <button type="submit" class="btn btn-primary w-100">Continua</button>
            </form>
        </section>

        <!-- ── Primo conto ──────────────────────────────────────────────── -->
        <section class="mx-passo" data-passo="conto" hidden>
            <h2 class="h5 mb-1">Il tuo primo conto</h2>
            <p class="text-body-secondary small">
                Un conto è dove stanno i soldi: il conto in banca, il portafoglio, una carta.
                Gli altri li aggiungi quando vuoi.
            </p>

            <form id="form-conto" autocomplete="off">
                ${csrfField(d.csrfToken)}
                <div class="mb-3">
                    <label class="form-label" for="conto-nome">Nome</label>
                    <input type="text" class="form-control" id="conto-nome" maxlength="60"
                           value="Conto corrente" required>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-7">
                        <label class="form-label" for="conto-tipo">Tipo</label>
                        <select class="form-select" id="conto-tipo">
                            ${TIPI_CONTO.map(([v, e]) => `<option value="${esc(v)}">${esc(e)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-5">
                        <label class="form-label" for="conto-valuta">Valuta</label>
                        <input type="text" class="form-control text-uppercase" id="conto-valuta"
                               maxlength="3" value="EUR" required>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="conto-saldo">Quanto c'è adesso</label>
                    <input type="text" class="form-control" id="conto-saldo" value="0,00" inputmode="decimal">
                    <div class="form-text">Se non lo sai, lascia zero: si sistema più avanti.</div>
                </div>
                <div class="alert alert-danger d-none" id="errore-conto" role="alert"></div>
                <button type="submit" class="btn btn-primary w-100" id="btn-conto">Comincia</button>
            </form>
        </section>

    </div>
</div>
`;
}
