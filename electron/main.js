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

// I dati stanno nella cartella dell'utente, non in quella di installazione:
// cosi' restano al loro posto quando l'app si aggiorna o si disinstalla.
// Va deciso prima di caricare il server, che legge questa variabile all'avvio.
process.env.MY_EXPENSE_DATA_DIR = app.getPath('userData');

// Due copie aperte scriverebbero sullo stesso database: la seconda cede il
// posto alla prima, che si fa avanti.
if (!app.requestSingleInstanceLock()) app.quit();

let finestra = null;

function creaFinestra(url) {
  finestra = new BrowserWindow({
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
  finestra.once('ready-to-show', () => finestra.show());

  // I link esterni (documentazione, siti delle banche) si aprono nel browser
  // dell'utente: dentro l'app non avrebbero ne' barra indirizzi ne' ritorno.
  const esterno = (target) => {
    if (target.startsWith(url)) return false;
    shell.openExternal(target);
    return true;
  };
  finestra.webContents.setWindowOpenHandler(({ url: target }) => {
    esterno(target);
    return { action: 'deny' };
  });
  finestra.webContents.on('will-navigate', (evento, target) => {
    if (esterno(target)) evento.preventDefault();
  });

  finestra.loadURL(url);
}

app.on('second-instance', () => {
  if (!finestra) return;
  if (finestra.isMinimized()) finestra.restore();
  finestra.focus();
});

app.on('window-all-closed', () => app.quit());

await app.whenReady();

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

try {
  // Importato qui e non in cima perche' la cartella dei dati dev'essere gia'
  // decisa: il server la legge nel momento in cui viene caricato.
  const { avvia } = await import('../server/index.js');
  const { url } = await avvia(0);
  creaFinestra(url);
} catch (err) {
  // Senza server non c'e' niente da mostrare: meglio dirlo che aprire una
  // finestra che non funziona.
  dialog.showErrorBox(
    'My Expense non riesce ad avviarsi',
    `${err.message}\n\nI dati si trovano in:\n${app.getPath('userData')}`,
  );
  app.quit();
}
