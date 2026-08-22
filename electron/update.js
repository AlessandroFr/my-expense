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
const defaultFolder = 'C:\\dev\\my-expense\\dist';

/** Il nome che electron-builder da' agli installer (`artifactName` in package.json). */
const INSTALLER_NAME = /^MyExpense-Setup-(\d+(?:\.\d+)*)\.exe$/;

/** Confronta due versioni tipo `1.2.10`: maggiore di zero se `a` e' piu' recente di `b`. */
export function compareVersions(a, b) {
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
export function newestInstaller(names, currentVersion) {
  let chosen = null;
  for (const name of names) {
    const found = INSTALLER_NAME.exec(name);
    if (!found) continue;
    const version = found[1];
    if (compareVersions(version, currentVersion) <= 0) continue;
    if (!chosen || compareVersions(version, chosen.version) > 0) chosen = { name, version };
  }
  return chosen;
}

/**
 * Cerca un aggiornamento e, se l'utente e' d'accordo, lo installa.
 *
 * Da sorgente non fa niente: li' l'aggiornamento e' `git pull`.
 */
export async function checkForUpdates(app, dialog, note) {
  if (!app.isPackaged) return;

  const folder = process.env.MY_EXPENSE_UPDATE_DIR || defaultFolder;
  let names;
  try {
    names = readdirSync(folder);
  } catch {
    note(`aggiornamenti: nessuna cartella ${folder}`);
    return;
  }

  const newer = newestInstaller(names, app.getVersion());
  if (!newer) return;
  note(`aggiornamenti: trovata la versione ${newer.version}`);

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Aggiornamento',
    message: `C'e' la versione ${newer.version}. Adesso hai la ${app.getVersion()}.`,
    detail: 'L\'app si chiude, si aggiorna e si riapre da sola. Le tue spese restano dove sono.',
    buttons: ['Aggiorna adesso', 'Piu\' tardi'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;

  // `/S` e' l'installazione silenziosa: nessuna domanda, stessa cartella di
  // prima, e alla fine l'app riparte da sola. L'installer chiude lui la copia
  // in esecuzione, ma tanto vale uscire subito e lasciargli il campo libero.
  spawn(join(folder, newer.name), ['/S'], { detached: true, stdio: 'ignore' }).unref();
  note('aggiornamenti: installer avviato, chiudo');
  app.quit();
}
