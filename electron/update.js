/**
 * L'aggiornamento dell'applicazione installata.
 *
 * Prima gli installer si cercavano in una cartella di questo computer, e
 * andava benissimo finche' l'app girava solo qui: `npm run dist` scriveva
 * l'installer proprio dove il codice lo andava a cercare. Su un computer di
 * qualcun altro quella cartella non esiste, e l'app non si aggiornerebbe mai —
 * senza dire niente, che e' il modo peggiore in cui puo' non funzionare.
 *
 * Adesso le versioni arrivano dalle Release del repo, con electron-updater. Il
 * repo e' pubblico apposta: scaricare da un repo privato vorrebbe dire mettere
 * un token dentro l'app, cioe' regalarlo a chiunque la installi.
 *
 * I dati non vengono toccati: stanno in %APPDATA%\My Expense, fuori dalla
 * cartella di installazione, e `deleteAppDataOnUninstall` e' falso.
 *
 * Electron non e' importato qui apposta: `app` e `dialog` arrivano come
 * argomenti, cosi' il file si puo' caricare anche nei test.
 */

import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

/**
 * Cerca un aggiornamento e, se l'utente e' d'accordo, lo scarica e lo installa.
 *
 * Da sorgente non fa niente: li' l'aggiornamento e' `git pull`.
 */
export async function checkForUpdates(app, dialog, note) {
  if (!app.isPackaged) return;

  // Scaricare e' una scelta dell'utente, non un fatto: su una connessione a
  // consumo un centinaio di megabyte scaricati di nascosto sono un dispetto.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = {
    info: (m) => note(`aggiornamenti: ${m}`),
    warn: (m) => note(`aggiornamenti (avviso): ${m}`),
    error: (m) => note(`aggiornamenti (errore): ${m}`),
    debug: () => {},
  };

  let esito;
  try {
    esito = await autoUpdater.checkForUpdates();
  } catch (err) {
    // Senza rete non c'e' niente da dire all'utente: l'app funziona lo stesso,
    // e un messaggio d'errore all'avvio sarebbe solo una porta da chiudere.
    note(`aggiornamenti: non raggiungibili (${err?.message ?? err})`);
    return;
  }

  const nuova = esito?.updateInfo?.version;
  if (!nuova || nuova === app.getVersion()) {
    note(`aggiornamenti: sei alla ${app.getVersion()}, e' l'ultima`);
    return;
  }
  note(`aggiornamenti: c'e' la ${nuova}`);

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Aggiornamento',
    message: `C'e' la versione ${nuova}. Adesso hai la ${app.getVersion()}.`,
    detail: 'L\'app la scarica, si chiude, si aggiorna e si riapre da sola. '
      + 'Le tue spese restano dove sono.',
    buttons: ['Aggiorna adesso', 'Piu\' tardi'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;

  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    note(`aggiornamenti: scarico fallito (${err?.message ?? err})`);
    dialog.showErrorBox(
      'L\'aggiornamento non e\' riuscito',
      `${err?.message ?? err}\n\nL'app continua a funzionare con la versione che hai.`,
    );
    return;
  }

  note('aggiornamenti: scaricato, installo');
  // `true, true`: silenzioso e riavvia. La seconda e' quella che conta — senza,
  // l'app si chiude e non torna, e chi la usa pensa che si sia rotta.
  autoUpdater.quitAndInstall(true, true);
}
