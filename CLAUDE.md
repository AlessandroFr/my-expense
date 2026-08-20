# CLAUDE.md

Guida per Claude Code (claude.ai/code) su questo repository.

## Cos'è

`my-expense` è un tracker di spese personali per **una persona sola**, che gira
in locale sulla sua macchina. Non c'è login: chi ha accesso al computer ha già
accesso al file dei dati.

Copre: spese ed entrate (con filtri, tag, allegati, quote condivise,
rateizzazione), budget mensili per categoria, spese ricorrenti, multi-conto con
saldi e riconciliazioni, trasferimenti fra conti, anagrafiche fornitori/clienti,
investimenti (strumenti, operazioni, posizioni) e piani di accumulo, report
annuali, import da CSV e da estratto conto Banca Sella/Patavina, backup ZIP,
lettura degli scontrini nel browser.

## Stack

**Node 24 e nient'altro.** Nessuna dipendenza a runtime: il database è
`node:sqlite`, il server `node:http`, i test `node:test`. Anche le cose che di
solito richiedono un pacchetto sono scritte qui perché servivano solo in
piccola parte: il lettore di form multipart, lo scrittore/lettore ZIP, il
riconoscimento del tipo di un file caricato.

Il frontend è invariato dai tempi di PHP: pagine HTML rese dal server e
migliorate da un modulo ES per pagina in `public/js/pages/`, con Bootstrap,
Chart.js e Tesseract.js da CDN. Nessun bundler.

PHP non c'è più. La migrazione è raccontata in
`C:\Users\perso\.claude\plans\prendi-in-mano-my-expense-noble-prism.md`; resta
da fare solo l'ultimo passo, impacchettare con `electron-builder`.

## Comandi

```powershell
avvia.cmd          # avvia l'app e apre la finestra
npm start          # solo il server
npm test           # i test
```

## Com'è organizzato

| Path | Ruolo |
|------|------|
| `server/index.js` | Il server: file statici, pagine, endpoint |
| `server/db.js` | Accesso al database e id dell'utente |
| `server/view.js` | Layout e helper di rendering (`esc`, `asset`, `each`) |
| `server/pages/` | Una funzione per pagina, restituisce HTML |
| `server/routes/` | Un file per dominio; `routes/index.js` è il registro |
| `server/routes/pages.js` | Le pagine HTML e i dati del primo caricamento |
| `server/amount.js` | Lettura e arrotondamento degli importi |
| `server/zip.js`, `multipart.js` | Formati che Node non ha in libreria standard |
| `server/bank-statement.js` | Lettura degli estratti conto |
| `public/js/` | Il frontend, un modulo per pagina |
| `database/schema.sql` | Lo schema, l'unica fonte |
| `config/config.json` | Configurazione locale, gitignored |
| `data/my-expense.sqlite` | I dati. Gitignored: il backup è copiarlo |

## Cose da sapere prima di toccare il codice

**Le foreign key di SQLite sono spente di default.** `db()` esegue
`PRAGMA foreign_keys = ON` a ogni connessione: senza quella riga i vincoli dello
schema smettono di valere in silenzio. Lo stesso pragma è un **no-op dentro una
transazione**, quindi va chiamato prima di aprirla (vedi
`routes/manutenzione.js`).

**Gli importi sono float.** SQLite non ha un tipo decimale. Ogni aggregazione va
arrotondata, e gli arrotondamenti passano da `roundLikePhp` in `amount.js`:
`Math.round(x * 100) / 100` sbaglia sui valori esattamente a metà, perché
`263.585 * 100` in virgola mobile fa `26358.499999999996`. Se un giorno servisse
precisione esatta la strada è memorizzare i centesimi come `INTEGER`.

**`parseAmountLikePhp` legge `1.234,56` come 1.234**, non 1234,56: non gestisce
il separatore delle migliaia. Era il comportamento di prima ed è rimasto per non
cambiare in silenzio il significato dei dati già inseriti. Cambiarlo è una
decisione, non una correzione.

**Il CSRF resta anche senza login.** Non serve a sapere chi sei: impedisce a una
pagina qualunque aperta nel browser di chiamare `127.0.0.1` a tua insaputa. Il
token vive quanto il processo, viaggia come cookie leggibile e torna come header
(`FetchRequest.js`), e il server controlla che coincidano.

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
- Modifiche allo schema: si aggiorna `database/schema.sql`. Un runner di
  migration idempotente arriverà col pacchetto Electron, dove serve davvero.
- Test dove la logica non è banale; sui percorsi che toccano denaro la
  correttezza viene prima della brevità.
- Ogni pezzo di lavoro finito e verificato va committato su `main`.
