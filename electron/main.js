/**
 * Il processo principale dell'applicazione installata.
 *
 * Fa tre cose: decide dove tenere i dati, avvia il server interno, apre la
 * finestra. Il contenuto della finestra e' lo stesso identico che si vedrebbe
 * in un browser: il frontend parla col server via HTTP e non sa di stare dentro
 * Electron, quindi l'app installata e `npm start` restano la stessa cosa.
 *
 * La porta la sceglie il sistema operativo (0 = «una libera qualunque»): niente
 * conflitti se la porta e' occupata, niente porta da ricordare.
 */

import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkForUpdates } from './update.js';

/**
 * Dove tenere i dati.
 *
 * Installata: nella cartella dell'utente, cosi' restano al loro posto quando
 * l'app si aggiorna o si disinstalla. Da sorgente: nella cartella del progetto,
 * come `npm start`, cosi' le prove non toccano i dati veri.
 *
 * MY_EXPENSE_DATA_DIR ha comunque l'ultima parola. Serve a provare una versione
 * nuova su una copia dei dati invece che su quelli veri, e a tenere i dati
 * altrove — su un disco esterno, per dirne una.
 *
 * Va deciso adesso, prima di caricare il server, che legge questa variabile nel
 * momento in cui viene importato.
 */
const dataFolder = process.env.MY_EXPENSE_DATA_DIR
  || (app.isPackaged ? app.getPath('userData') : join(import.meta.dirname, '..'));

process.env.MY_EXPENSE_DATA_DIR = dataFolder;

/**
 * Diario dell'avvio.
 *
 * L'applicazione installata non ha una finestra nera dove leggere gli errori:
 * se qualcosa va storto prima che compaia la finestra, senza questo file non
 * resta traccia di niente e il sintomo e' soltanto «non si apre».
 */
function note(message) {
  try {
    const dir = join(dataFolder, 'logs');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'avvio.log'), `${new Date().toISOString()}  ${message}\n`);
  } catch { /* se non si puo' scrivere, pazienza: non e' questo a dover fermare l'avvio */ }
}

process.on('uncaughtException', (err) => {
  note(`errore non gestito: ${err?.stack ?? err}`);
  dialog.showErrorBox('My Expense si e\' fermata', String(err?.message ?? err));
  app.exit(1);
});

note(`avvio, versione ${app.getVersion()}`);

// Due copie aperte scriverebbero sullo stesso database. La seconda cede il
// posto alla prima e se ne va subito: `app.quit()` non basterebbe, perche'
// chiude con calma e intanto il resto del file continuerebbe a girare,
// avviando un secondo server.
if (!app.requestSingleInstanceLock()) {
  note('c\'e\' gia\' una copia aperta: cedo il posto a quella');
  app.exit(0);
}

let mainWindow = null;

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f8f9fa',
    title: 'My Expense',
    webPreferences: {
      // La finestra non ha bisogno di Node: tutto quello che le serve lo chiede
      // al server via fetch, esattamente come farebbe un browser.
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  // Mostrata solo quando c'e' qualcosa da vedere, per non aprire un rettangolo
  // bianco mentre la pagina carica.
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // I link esterni (documentazione, siti delle banche) si aprono nel browser
  // dell'utente: dentro l'app non avrebbero ne' barra indirizzi ne' ritorno.
  const esterno = (target) => {
    if (target.startsWith(url)) return false;
    shell.openExternal(target);
    return true;
  };
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    esterno(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (evento, target) => {
    if (esterno(target)) evento.preventDefault();
  });

  mainWindow.loadURL(url);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => app.quit());

/**
 * Tutto l'avvio sta qui dentro, e questa funzione va chiamata **senza await**.
 *
 * Non e' pignoleria: Electron considera l'applicazione pronta solo dopo che
 * questo file ha finito di essere valutato. Un `await` al livello piu' esterno
 * del file lo tiene in valutazione per sempre, quindi «pronta» non arriva mai,
 * l'attesa non finisce mai e la finestra non si apre — senza un errore, senza
 * un messaggio, senza niente. Dentro una funzione, invece, il file finisce
 * subito e l'attesa si risolve regolarmente.
 */
async function startApplication() {
  await app.whenReady();
  note('pronta');

  // Solo le voci che servono davvero: ricarica, zoom, strumenti di sviluppo. Il
  // resto del menu standard parla di finestre e schede che qui non esistono.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{
    label: 'Visualizza',
    submenu: [
      { role: 'reload', label: 'Ricarica' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Dimensione normale' },
      { role: 'zoomIn', label: 'Ingrandisci' },
      { role: 'zoomOut', label: 'Rimpicciolisci' },
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Strumenti di sviluppo' },
      { type: 'separator' },
      { role: 'quit', label: 'Esci' },
    ],
  }]));

  // Importato qui e non in cima perche' la cartella dei dati dev'essere gia'
  // decisa: il server la legge nel momento in cui viene caricato.
  const { start } = await import('../server/index.js');
  const { url, port } = await start(0);
  note(`server in ascolto sulla porta ${port}`);
  createWindow(url);
  note('finestra aperta');

  // Dopo la finestra, non prima: un aggiornamento che non arriva non deve
  // ritardare l'avvio, e se qualcosa va storto l'app e' gia' utilizzabile.
  checkForUpdates(app, dialog, note)
    .catch((err) => note(`aggiornamenti: ${err?.stack ?? err}`));
}

startApplication().catch((err) => {
  // Senza server non c'e' niente da mostrare: meglio dirlo che aprire una
  // finestra che non funziona.
  note(`avvio fallito: ${err?.stack ?? err}`);
  dialog.showErrorBox(
    'My Expense non riesce ad avviarsi',
    `${err.message}\n\nI dettagli sono in:\n${join(dataFolder, 'logs', 'avvio.log')}`,
  );
  app.exit(1);
});
