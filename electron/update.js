/**
 * L'aggiornamento dell'applicazione installata.
 *
 * All'avvio guarda in una cartella di questo computer se c'e' un installer piu'
 * recente di quello che sta girando; se c'e', lo chiede e lo esegue in
 * silenzio. I dati non vengono toccati: stanno in %APPDATA%\My Expense, fuori
 * dalla cartella di installazione.
 *
 * ponytail: gli aggiornamenti arrivano da una cartella, non da un server. Il
 * codice sorgente e l'app installata sono sulla stessa macchina, quindi
 * `npm run dist` scrive l'installer proprio dove questo file lo va a cercare.
 * Mettere di mezzo GitHub vorrebbe dire pubblicare una release e portarsi un
 * token dentro il pacchetto per ogni correzione da due righe. Se un giorno
 * l'app dovesse aggiornarsi su un computer diverso da questo, la strada e'
 * electron-updater con le Release del repo.
 *
 * Electron non e' importato qui apposta: `app` e `dialog` arrivano come
 * argomenti, cosi' il file si puo' caricare anche nei test.
 */

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Dove `npm run dist` lascia gli installer. MY_EXPENSE_UPDATE_DIR ha la precedenza. */
const cartellaPredefinita = 'C:\\dev\\my-expense\\dist';

/** Il nome che electron-builder da' agli installer (`artifactName` in package.json). */
const NOME_INSTALLER = /^MyExpense-Setup-(\d+(?:\.\d+)*)\.exe$/;

/** Confronta due versioni tipo `1.2.10`: maggiore di zero se `a` e' piu' recente di `b`. */
export function confrontaVersioni(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const differenza = (pa[i] || 0) - (pb[i] || 0);
    if (differenza) return differenza;
  }
  return 0;
}

/**
 * Fra i nomi di file passati, l'installer piu' recente — ma solo se batte la
 * versione corrente. Gli installer vecchi restano nella cartella e vengono
 * semplicemente ignorati, non c'e' niente da ripulire.
 */
export function installerPiuRecente(nomi, versioneCorrente) {
  let scelto = null;
  for (const nome of nomi) {
    const trovato = NOME_INSTALLER.exec(nome);
    if (!trovato) continue;
    const versione = trovato[1];
    if (confrontaVersioni(versione, versioneCorrente) <= 0) continue;
    if (!scelto || confrontaVersioni(versione, scelto.versione) > 0) scelto = { nome, versione };
  }
  return scelto;
}

/**
 * Cerca un aggiornamento e, se l'utente e' d'accordo, lo installa.
 *
 * Da sorgente non fa niente: li' l'aggiornamento e' `git pull`.
 */
export async function controllaAggiornamenti(app, dialog, nota) {
  if (!app.isPackaged) return;

  const cartella = process.env.MY_EXPENSE_UPDATE_DIR || cartellaPredefinita;
  let nomi;
  try {
    nomi = readdirSync(cartella);
  } catch {
    nota(`aggiornamenti: nessuna cartella ${cartella}`);
    return;
  }

  const nuovo = installerPiuRecente(nomi, app.getVersion());
  if (!nuovo) return;
  nota(`aggiornamenti: trovata la versione ${nuovo.versione}`);

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Aggiornamento',
    message: `C'e' la versione ${nuovo.versione}. Adesso hai la ${app.getVersion()}.`,
    detail: 'L\'app si chiude, si aggiorna e si riapre da sola. Le tue spese restano dove sono.',
    buttons: ['Aggiorna adesso', 'Piu\' tardi'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;

  // `/S` e' l'installazione silenziosa: nessuna domanda, stessa cartella di
  // prima, e alla fine l'app riparte da sola. L'installer chiude lui la copia
  // in esecuzione, ma tanto vale uscire subito e lasciargli il campo libero.
  spawn(join(cartella, nuovo.nome), ['/S'], { detached: true, stdio: 'ignore' }).unref();
  nota('aggiornamenti: installer avviato, chiudo');
  app.quit();
}
