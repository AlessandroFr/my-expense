// La schermata di sblocco: l'unica cosa che si vede finché il database è chiuso.

import { csrfField, esc } from '../view.js';

export function render(d) {
  return `
<div class="card shadow-sm">
    <div class="card-body p-4">
        <h2 class="h5 mb-1">Bentornato</h2>
        <p class="text-body-secondary small">
            I tuoi dati sono al sicuro: per aprirli serve la tua password.
        </p>

        <form id="form-sblocco" autocomplete="off">
            ${csrfField(d.csrfToken)}
            <div class="mb-3">
                <label class="form-label" for="password">Password</label>
                <input type="password" class="form-control form-control-lg" id="password"
                       name="segreto" autocomplete="current-password" autofocus required>
            </div>

            <div class="d-none mb-3" id="riquadro-recupero">
                <label class="form-label" for="chiave">Chiave di recupero</label>
                <input type="text" class="form-control font-monospace" id="chiave"
                       placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off">
                <div class="form-text">
                    È il codice che l'app ti ha fatto salvare quando hai creato la password.
                    Puoi scriverlo con o senza trattini.
                </div>
            </div>

            <div class="alert alert-danger d-none" id="errore" role="alert"></div>

            <button type="submit" class="btn btn-primary w-100" id="btn-sblocca">Apri</button>
        </form>

        <div class="text-center mt-3">
            <button type="button" class="btn btn-link btn-sm text-body-secondary" id="btn-dimenticata">
                Ho dimenticato la password
            </button>
        </div>
    </div>
</div>

<p class="text-body-secondary small text-center mt-3 mb-0">
    ${esc('Senza password e senza chiave di recupero i dati non si possono aprire: '
      + 'non è una formalità, non esiste nessun altro modo.')}
</p>
`;
}
