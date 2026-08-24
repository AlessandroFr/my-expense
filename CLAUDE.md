# CLAUDE.md

Guida per Claude Code (claude.ai/code) su questo repository.

## Cos'è

`my-expense` è un tracker di spese personali che gira in locale sulla macchina
di chi lo usa. Ogni installazione è di una persona sola — c'è una riga sola in
`users` — ma l'app **si distribuisce**: Alessandro la dà anche ad amici, e da lì
vengono la password all'avvio, la procedura di benvenuto e gli aggiornamenti
dalle Release.

**Il database è cifrato** e si apre con una password (`server/vault.js`,
`server/lock.js`). Non c'è più il «chi ha acceso il computer ha già i dati»: chi
copia il file non ci legge niente.

Copre: spese ed entrate (con filtri, tag, allegati, quote condivise,
rateizzazione), budget mensili per categoria, spese ricorrenti, multi-conto con
saldi e riconciliazioni, trasferimenti fra conti, anagrafiche fornitori/clienti,
investimenti (strumenti, operazioni, posizioni) e piani di accumulo, report
annuali, import da CSV e da estratto conto bancario (un profilo per banca),
backup cifrato, lettura degli scontrini nel browser, e più valute — una per
conto, con i totali in quella principale.

## Stack

**Node 24 e due dipendenze.** Il server è `node:http`, i test `node:test`, e le
cose che di solito richiedono un pacchetto sono scritte qui perché servivano
solo in piccola parte: il lettore di form multipart, lo scrittore/lettore ZIP,
il riconoscimento del tipo di un file caricato.

Le due che ci sono hanno un motivo che non si aggira scrivendo codice:

- **`better-sqlite3-multiple-ciphers`** al posto di `node:sqlite`, perché la
  libreria standard non cifra e non cifrerà. L'API è la stessa
  (`prepare().all/get/run`, `exec`, `close`), e **non c'è niente da
  ricompilare**: è un modulo N-API, un binario per piattaforma che vale sia per
  Node sia per Electron.
- **`electron-updater`**, perché su un computer che non è questo l'aggiornamento
  deve arrivare da qualche parte.

Il frontend è invariato dai tempi di PHP: pagine HTML rese dal server e
migliorate da un modulo ES per pagina in `public/js/pages/`. Nessun bundler.

Bootstrap, le icone, i font, Chart.js e TinyMCE stanno in `public/vendor/`, non
su un CDN: un'applicazione installata deve funzionare senza rete. I file si
copiano da `node_modules` (le versioni sono fissate nelle devDependencies) e
sono in git, così il repo appena clonato funziona.

Si distribuisce come **applicazione installabile**: `electron-builder` produce un
installer per Windows, e dentro c'è un solo runtime. Non è firmato — un
certificato costa qualche centinaio di euro l'anno e questi sono amici — quindi
al primo avvio Windows mostra SmartScreen: `INSTALLAZIONE.md` spiega i due clic
che servono a passare oltre.

PHP non c'è più: la migrazione da XAMPP + Apache + MySQL a Electron + SQLite
è stata fatta in sette fasi, e ne resta traccia nella storia dei commit.

## Comandi

```powershell
npm run app        # la finestra dell'app (Electron)
npm start          # solo il server, da aprire nel browser
npm test           # i test
npm run test:e2e   # i test end-to-end nel browser (Playwright)
npm run dist       # crea l'installer in dist\
```

## Com'è organizzato

| Path | Ruolo |
|------|------|
| `electron/main.js` | Il processo principale: dati, server, finestra |
| `electron/update.js` | L'aggiornamento, dalle Release del repo |
| `server/index.js` | Il server: file statici, pagine, endpoint; esporta `start()` |
| `server/paths.js` | Dove stanno database, allegati e configurazione |
| `server/db.js` | Accesso al database e id dell'utente |
| `server/vault.js` | Le chiavi che aprono il database, e la cifratura dei backup |
| `server/lock.js` | Il lucchetto: in che stato siamo e chi ha la chiave |
| `server/fx.js` | I cambi e il controvalore di un movimento |
| `server/view.js` | Layout e helper di rendering (`esc`, `asset`, `each`) |
| `server/pages/` | Una funzione per pagina, restituisce HTML |
| `server/routes/` | Un file per dominio; `routes/index.js` è il registro |
| `server/routes/pages.js` | Le pagine HTML e i dati del primo caricamento |
| `server/amount.js` | Lettura e arrotondamento degli importi |
| `server/zip.js`, `multipart.js` | Formati che Node non ha in libreria standard |
| `server/bank-statement.js` | Lettura degli estratti conto: date, importi, significato |
| `server/bank-profiles.js` | Il tracciato di ogni banca e il suo riconoscimento |
| `server/contact-dedup.js` | Quali anagrafiche sono la stessa cosa scritta in due modi |
| `server/pac-performance.js` | Andamento e rendimento di un piano di accumulo |
| `server/pac-split.js` | Come una spesa sola si divide in quote fra piu' piani |
| `server/nav-fetch.js` | Le quotazioni di fondi e titoli prese da Internet |
| `public/js/trade-mark.js` | La finestra che marca un'uscita come acquisto di titoli |
| `public/js/` | Il frontend, un modulo per pagina |
| `public/js/modal-guard.js` | Le finestre non si chiudono per sbaglio e non perdono quel che c'era scritto |
| `public/vendor/` | Bootstrap, icone, font, grafici, editor. In locale |
| `database/schema.sql` | Lo schema di partenza |
| `database/migrate.js` | Porta il database alla versione attesa, a ogni avvio |
| `build/icon.png` | L'icona dell'app |
| `config/config.json` | Configurazione locale, gitignored |
| `data/my-expense.sqlite` | I dati da sorgente. Gitignored: il backup è copiarlo |
| `e2e/` | I test nel browser: `server.js` semina e avvia, le spec provano |

## Cose da sapere prima di toccare il codice

**I dati stanno in due posti diversi a seconda di come parte l'app.** Da sorgente
nella cartella del progetto (`app.isPackaged` è falso), installata in
`%APPDATA%\My Expense` — il nome viene da `productName`, che va tenuto nella
**radice** del package.json e non solo dentro `build`, o Electron ripiega su
`name` e i dati finiscono in un'altra cartella. Decide `MY_EXPENSE_DATA_DIR`,
che `electron/main.js` imposta **prima** di caricare il server: `paths.js` la
legge nel momento in cui viene importato, quindi sostituire quell'`import`
dinamico con uno statico in cima al file scriverebbe i dati dentro la cartella
di installazione, in silenzio.

**Mai un `await` al livello più esterno di `electron/main.js`.** Electron
considera l'app pronta solo dopo che quel file ha finito di essere valutato: un
`await app.whenReady()` scritto lì lo tiene in valutazione per sempre, quindi
«pronta» non arriva mai e la finestra non si apre — senza errori e senza
messaggi. Per questo l'avvio sta dentro `startApplication()`, chiamata **senza**
await.

**La porta la sceglie il sistema operativo.** `start(0)` chiede una porta libera
qualunque e restituisce quella assegnata. Nessuna porta fissa da difendere,
nessun conflitto con quello che gira già sulla macchina.

**`migrate()` gira a ogni avvio e dev'essere sempre idempotente.** È così che
un'installazione già esistente riceve le modifiche allo schema, cosa che con il
vecchio installer non succedeva mai. Su database vuoto si crea da `schema.sql` e
le migration presenti si segnano come applicate senza eseguirle; su database
esistente si applicano solo quelle non registrate, una transazione ciascuna.

**L'app si aggiorna dalle Release del repo**, con `electron-updater`. Il repo è
pubblico apposta: scaricare da uno privato vorrebbe dire mettere un token dentro
il pacchetto, cioè regalarlo a chiunque installi l'app. Pubblicare una versione
è alzare `version` in `package.json` e `npm run dist -- --publish always` con
`GH_TOKEN` nell'ambiente. Da sorgente il controllo non parte
(`app.isPackaged`).

Lo scarico **non** è automatico (`autoDownload = false`): su una connessione a
consumo un centinaio di megabyte presi di nascosto sono un dispetto. E
`quitAndInstall(true, true)` — la seconda è quella che conta, senza l'app si
chiude e non torna.

**Due cose chiedono la rete, e nessuna delle due parte da sola.** La lettura
degli scontrini (`ocr.js` carica Tesseract.js da un CDN quando serve: portarlo
dentro vorrebbe dire venti megabyte fra libreria e modello della lingua per una
funzione accessoria) e lo scarico delle quotazioni (`nav-fetch.js`, sotto). Se
la rete manca, il messaggio lo dice e il resto continua a funzionare. Tutto il
resto è in `public/vendor/` e non esce mai dal computer.

**Le quotazioni si scaricano da Yahoo Finance, che non ha una API dichiarata.**
`nav-fetch.js` è l'unica parte del *server* che esce dal computer, e lo fa solo
quando l'utente preme il bottone: niente aggiornamenti in sottofondo, niente
chiamate all'avvio; quel che parte è un ISIN o un simbolo di borsa. Il NAV a
mano resta ed è la strada che non può rompersi — se un giorno l'endpoint
cambia, l'unica cosa che smette di funzionare è il bottone.

Tre regole che vengono dai soldi, non dal codice:
- **La valuta si verifica prima di salvare.** Lo stesso ETF è quotato su più
  borse: preso il listino in dollari, il piano sembrerebbe cresciuto o calato
  per il cambio. Si provano i candidati in ordine (Milano per prima) e si tiene
  il primo che quota nella valuta del fondo.
- **Cercare l'ISIN spesso trova una borsa sola**, e non è detto sia quella
  giusta — dell'iShares Core MSCI World esce solo Londra in dollari. Per questo
  si cerca una seconda volta per **nome esteso**, che invece le trova tutte. Il
  simbolo buono resta scritto sul fondo (`pac_funds.symbol`) e si può correggere
  a mano.
- **Quello che c'è già non si tocca**: `INSERT OR IGNORE`, quindi un NAV scritto
  a mano vince sempre su uno scaricato. I versamenti rimasti senza quote perché
  al momento non c'era un NAV vengono invece valorizzati, ma solo quelli
  (`nav IS NULL OR units IS NULL`).

**Le finestre si chiudono solo con un bottone.** `public/js/modal-guard.js` si
carica dal layout su ogni pagina e vale per tutte e sedici: le Bootstrap hanno
`data-bs-backdrop="static"` e `data-bs-keyboard="false"` nel markup, le
`<dialog>` native non si chiudevano gia' su clic esterno e ora nemmeno con Esc
(evento `cancel`). Se una finestra si chiude lo stesso, quel che c'era scritto
viene ripreso alla riapertura — ma **solo sullo stesso record**, chiave
`id della finestra + valore del campo id`, altrimenti aprire la scheda di
un'altra spesa mostrerebbe i dati della precedente. Il ripristino passa da
`showModal()` sostituita sul prototipo, quindi **le pagine devono riempire i
campi prima di aprire**, non dopo: al contrario il ripristino verrebbe
sovrascritto. Dopo un invio del form non si riprende niente (`mxSalvato`), a
meno che l'utente ricominci a scrivere — cosa che succede quando il
salvataggio e' fallito.

**Il service worker esiste solo per disinstallarsi.** Serviva quando l'app si
apriva nel browser e si poteva installare come PWA. Cancellarlo non sarebbe
bastato: uno già registrato resta attivo finché non si toglie da solo, ed è
quello che ora fa `public/sw.js`. Quando sarà passato abbastanza tempo perché
nessun browser lo abbia più, si può togliere anche quello.

**Le foreign key di SQLite sono spente di default.** `db()` esegue
`PRAGMA foreign_keys = ON` a ogni connessione: senza quella riga i vincoli dello
schema smettono di valere in silenzio. Lo stesso pragma è un **no-op dentro una
transazione**, quindi va chiamato prima di aprirla (vedi
`routes/manutenzione.js`).

**Il rendimento di un PAC non è «valore meno versato».** I soldi versati il
mese scorso non hanno avuto il tempo di rendere quanto quelli di tre anni fa,
quindi la percentuale onesta è il TIR (`pac-performance.js::irr`, l'XIRR dei
fogli di calcolo), che sconta ogni versamento dalla sua data. Si cerca per
bisezione e non con Newton: qualche millesimo di secondo in più, ma non diverge
mai, e su un numero mostrato come «rendimento» questo conta di più. La
percentuale secca sul versato resta accanto, come dato di montante.

**Senza NAV il valore non si mostra.** Né nella curva (`valore: null`, buco nel
grafico) né nei riquadri: un piano senza quotazioni fa vedere solo quanto è
stato versato. Il valore viene sempre etichettato con **la data del NAV usato**
(`nav_al`), che non è per forza oggi — un NAV vecchio di sei mesi valorizza lo
stesso, ma chi legge deve saperlo.

**Il saldo di un conto PAC non è quanto vale.** È la somma dei trasferimenti
entrati, e da solo non sale mai. `accounts.withBalances` aggiunge
`market_value`/`market_gain` per i conti che ospitano un piano **o un dossier
titoli** (`investmentValues`, che somma i due) — `null` per tutti gli altri,
dove non significherebbero niente.

**Cambiare fondo a piano avviato rifà le quote.** Sbagliare fondo alla creazione
e accorgersene dopo mesi capita; l'unica alternativa sarebbe cancellare il piano,
e la `CASCADE` si porterebbe via tutti i versamenti. `routes/pac.js::
recalculateUnits` riscrive NAV e quote di ogni versamento con il NAV che il
fondo nuovo aveva quel giorno — le quote appartengono al fondo in cui i soldi
sono finiti, quelle vecchie descriverebbero un altro prodotto. Passa di lì sia
`change-fund` sia `updatePlan`, che il fondo lo cambiava già e lasciava le quote
di prima.

**I versamenti PAC non si generano da soli: si segnano sui movimenti.** I soldi
escono dal conto una volta sola, e quella volta si vede sull'estratto conto:
generarli anche dal piano voleva dire contarli due volte. Quindi il punto di
partenza è la spesa importata, che si marca come versamento — dall'elenco spese
o dall'anteprima dell'import — e si divide in quote fra i piani
(`routes/pac.js::setExpenseSplit`, conto della divisione in `pac-split.js`, che
è puro e testato). Il piano resta il *modello* di quella divisione: importo,
frequenza e fondo servono a proporla (`suggestShares` propone solo se gli
importi dei piani fanno esattamente quello del movimento — una divisione
inventata in mezzo a dei soldi è peggio di nessuna divisione).

Segnata, la spesa **diventa la faccia in uscita di un trasferimento** verso il
conto PAC (`is_transfer = 1`, quindi sparisce dall'elenco spese e dai totali) ma
non cambia importo né data, e non viene mai ricreata: è una riga vera
dell'estratto. Per questo `clearSplitRows` la stacca **prima** di cancellare il
trasferimento — la `CASCADE` se la porterebbe dietro — e per questo il cestino
su un versamento con `expense_id` disfa tutta la divisione invece di cancellare
la riga da sola: sul conto PAC resterebbero soldi che nessun piano dichiara.
`expense_id` (migration `0004`) è la differenza fra un versamento nato da un
movimento vero e quelli che il piano si generava da solo.

**Gli acquisti di titoli seguono la stessa strada.** L'«ACQUISTO TITOLI» è già
una riga dell'estratto: registrarlo anche fra gli investimenti farebbe uscire i
soldi due volte. Quindi si marca la spesa (`routes/securities.js::
setExpenseTrade`, dal menu della riga in elenco spese), che diventa la faccia in
uscita di un trasferimento verso il dossier e smette di contare come spesa —
comprare titoli non è spendere, è spostare. Il prezzo per quota non si chiede:
viene dall'importo del movimento meno le commissioni, diviso le quote, così è
per forza coerente con quanto il conto ha pagato. Disfare (cestino
sull'operazione) riporta la spesa in elenco invece di cancellarla:
`clearTradeRows` distingue le due origini dal `transfer_id`, che ce l'ha solo
l'operazione nata da un movimento vero.

Anche le operazioni scritte a mano dalla scheda Investimenti seguono la regola:
**BUY e SELL nascono `is_transfer = 1`**, DIVIDEND resta entrata e FEE resta
spesa, perché quelli sono guadagno e costo veri.

**Le quotazioni dei titoli si scaricano come i NAV dei fondi**
(`securities/prices/fetch`, stesso `nav-fetch.js`): parte solo a bottone
premuto, scarta i listini in valuta diversa, salva il ticker buono sullo
strumento e **non sovrascrive** i prezzi già presenti — `insertDownloadedPrice`
usa `source = 'external'`, che è una delle due parole ammesse dal `CHECK` sulla
colonna (l'altra è `manual`, e quello scritto a mano vince sempre).

**La valuta di un movimento è quella del suo conto**, e il suo controvalore
nella valuta principale (`amount_base`) è **congelato alla data del movimento**:
un report del 2025 non deve cambiare perché oggi il cambio si è mosso. Le somme
restano somme di una colonna sola — `SUM(COALESCE(amount_base, amount))`, cioè
`fx.inBase()` — invece di una JOIN sui cambi in ogni query. I saldi dei conti
**non** si convertono: restano nella valuta del conto, o non si potrebbero
confrontare con l'estratto della banca.

**Chi riempie `amount_base` non è nessuna delle route che scrivono un
movimento.** Il lavoro è diviso in due: i trigger di `0006` dicono *quando* un
controvalore è scaduto (importo, conto, data, valuta del conto, valuta
principale) mettendolo a NULL; `fx.allinea()` dice *quanto* vale, e parte da un
punto solo — `server/index.js`, dopo ogni scrittura andata a buon fine. Così una
route scritta il mese prossimo non ha niente da ricordarsi, e su
un'installazione tutta nella valuta principale sono quattro SELECT su indice che
non trovano niente. Scrivere la conversione anche in SQL sarebbero due regole
del denaro da tenere d'accordo per sempre.

**I cambi sono sempre contro EUR**, che fa da perno: è come li pubblica ogni
fonte, e le altre coppie si ricavano per triangolazione. Il cambio di un
movimento è quello del suo giorno o dell'ultimo noto prima. Un movimento senza
cambio resta scoperto e conta per l'importo grezzo: sbagliato ma visibile, e
`fx.senzaControvalore()` lo va a cercare per dirlo.

**Gli importi sono float.** SQLite non ha un tipo decimale. Ogni aggregazione va
arrotondata, e gli arrotondamenti passano da `roundLikePhp` in `amount.js`:
`Math.round(x * 100) / 100` sbaglia sui valori esattamente a metà, perché
`263.585 * 100` in virgola mobile fa `26358.499999999996`. Se un giorno servisse
precisione esatta la strada è memorizzare i centesimi come `INTEGER`.

**`parseAmountLikePhp` legge `1.234,56` come 1.234**, non 1234,56: non gestisce
il separatore delle migliaia. Era il comportamento di prima ed è rimasto per non
cambiare in silenzio il significato dei dati già inseriti. Cambiarlo è una
decisione, non una correzione.

Accanto c'è **`parseAmountItaliano`**, che le migliaia le gestisce, e serve ai
campi **nuovi**, dove non c'è niente di vecchio da rispettare: il saldo iniziale
nella procedura di benvenuto e i cambi. Lì leggere 1.234,50 come «uno e
ventitré» sarebbe solo un errore.

**L'estratto conto si legge per nome di colonna, non per posizione.** Un
profilo (`bank_profiles`) dice come si chiamano le colonne di quella banca; il
riconoscimento prova ogni profilo su ogni riga di intestazione plausibile e
vince chi mappa più colonne. I profili preimpostati nascono da
`ensureBuiltins()` in `routes/bank-profiles.js`, **non** da un `INSERT` nella
migration: su database nuovo le migration vengono solo registrate, quindi una
semina SQL non girerebbe mai. Solo Sella e Mediolanum sono verificati su file
veri — gli altri sono ipotesi, ed è per questo che l'anteprima mostra sempre la
mappatura prima di scrivere.

**Un preimpostato mai modificato si riallinea da solo** al codice a ogni
`ensureBuiltins()` (`updated_at = created_at` è il segno che nessuno l'ha
toccato): è così che la correzione al tracciato di una banca arriva anche a chi
ha già il database. Chi l'ha modificato se lo tiene, e «Ripristina» lo riporta
allo stato di «mai toccato».

**Sella e Mediolanum esportano lo stesso identico tracciato**
(`Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate`, dove
«Operazione» è la data contabile). Dall'intestazione non si distinguono: per
questo il conto porta `bank_profile_id`, e quando c'è l'import usa quello senza
tirare a indovinare (`routes/bank-import.js`). Senza profilo assegnato si torna
al riconoscimento automatico.

**Il CSRF è un'altra cosa dalla password**, e serve anche a chi è già dentro:
impedisce a una pagina qualunque aperta nel browser di chiamare `127.0.0.1` a
tua insaputa. Il token vive quanto il processo, viaggia come cookie leggibile e
torna come header (`FetchRequest.js`), e il server controlla che coincidano.

**Il cancello sta in un punto solo**, in `server/index.js` prima di
`routes.get()`. Finché la password non è arrivata l'unica cosa che risponde è lo
sblocco (o il benvenuto): una pagina viene rimandata lì, una chiamata del
frontend riceve `423`. Aggiungere una route non la rende raggiungibile — per
quello c'è la lista `APERTE`, che è corta apposta.

**La chiave del database sta in memoria e lì soltanto**, per il tempo in cui
l'app resta aperta. Non deriva dalla password: è incartata due volte, con la
password e con la chiave di recupero (`vault.js`). Così cambiare password non
ricifra il database — a metà strada sarebbe illeggibile — e chi la dimentica non
resta chiuso fuori per sempre.

**Il primo avvio su un database in chiaro lo cifra**, e l'ordine non è
negoziabile: copia di sicurezza, `journal_mode = DELETE` (SQLite si rifiuta di
cifrare un database aperto in WAL, e il WAL resterebbe leggibile), `rekey`,
riapertura, verifica, **poi** il vault. Scriverlo prima vorrebbe dire, dopo un
errore a metà, dire all'avvio successivo di aprire con una chiave un database
che quella chiave non ha.

**Il frontend legge chiavi precise dall'envelope JSON.** `showBudgetWarning()` in
`public/js/pages/expenses.js` usa `exceeded` e `near_limit`: se un endpoint
smette di produrle, l'avviso sparisce senza errori.

**Le soglie si confrontano sui valori grezzi.** L'avviso di budget usa la
percentuale non arrotondata: con `progress_pct` scatterebbe già a 79,95%.

**Le date delle ricorrenze sbordano di proposito.** `avanza()` in
`routes/recurring.js` porta il 31 gennaio al 3 marzo, non al 28 febbraio. Le
rate invece restano dentro il mese (`installments.js`): sono due regole diverse
e volute.

## Convenzioni

- Codice e identificatori in inglese, commenti e testi dell'interfaccia in
  italiano. Adeguarsi al file in cui si sta scrivendo.
- Gli endpoint rispondono con `{ok: true, data}` oppure
  `{ok: false, error: {code, message}}`.
- Modifiche allo schema: `database/schema.sql` **più** un file in
  `database/migrations/`. Solo il primo, e chi ha già l'app installata resta
  indietro per sempre.
- Test dove la logica non è banale; sui percorsi che toccano denaro la
  correttezza viene prima della brevità.
- I test unitari (`npm test`) restano puri: niente database, niente rete. Quello
  che si vede solo nel browser — una pagina che non si apre, un modale che non
  salva — sta in `e2e/` (`npm run test:e2e`), su un database usa-e-getta che
  `e2e/server.js` ricrea e semina a ogni avvio.
- Ogni pezzo di lavoro finito e verificato va committato su `main`.
