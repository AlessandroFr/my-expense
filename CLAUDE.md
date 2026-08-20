# CLAUDE.md

Guida per Claude Code (claude.ai/code) su questo repository.

## Cos'è

`my-expense` è un tracker di spese personali **monoutente**: la registrazione si
chiude dopo il primo utente (`src/class/Auth.php`), non ci sono ruoli né tenant.
Gira in locale, per una persona sola, sulla sua macchina.

Copre: spese ed entrate (con filtri, tag, allegati, quote condivise,
rateizzazione), budget mensili per categoria, spese ricorrenti, multi-conto con
saldi e riconciliazioni, trasferimenti fra conti, anagrafiche fornitori/clienti,
investimenti (strumenti, transazioni, holdings) e piani di accumulo, report
annuali, import da CSV e da estratto conto Banca Sella/Patavina, backup ZIP,
OCR degli scontrini lato browser.

## Dove sta andando

È in corso il passaggio da app web servita da XAMPP a **applicazione desktop
Electron installabile**. Il piano completo, con le fasi e il perché di ogni
scelta, sta in
`C:\Users\perso\.claude\plans\prendi-in-mano-my-expense-noble-prism.md`.

Fatto finora: via Apache e MySQL, database SQLite, doppioni del refactor MVC
eliminati, e **92 endpoint su 99 serviti da Node**. Tutti i domini
dell'applicazione sono migrati; a PHP restano solo i 5 endpoint di
autenticazione e i 2 che chiedono la password come freno prima di
un'operazione distruttiva (`/backup/restore`, `/db/reset`) — verificarla
significa confrontare un hash bcrypt, che Node non fa senza dipendenze.

Da fare: la fase 6 elimina l'autenticazione (un'app desktop monoutente non ne
ha bisogno) e con essa quei 7 endpoint, poi converte le 20 pagine HTML e
spegne PHP; la fase 7 impacchetta con `electron-builder`.

**Il frontend non va toccato.** `public/js/` (9.000 righe) parla col backend via
`fetch()` su un envelope JSON stabile: finché URL ed envelope restano quelli, il
passaggio a Node non richiede di riscriverlo. È la ragione per cui il server
HTTP locale resta anche dentro Electron, invece di passare a IPC.

## Comandi

```powershell
avvia.cmd                                  # avvia l'app e apre la finestra
npm test                                   # test JS (node --test, zero dipendenze)
php vendor/bin/phpunit                     # test PHP (quel che resta)
node tests/parity/confronta.mjs            # confronta le risposte di Node con quelle di PHP
composer install                           # dipendenze PHP, finché PHP c'è
```

`avvia.cmd` lancia due processi: Node davanti sulla 8080, che serve gli
endpoint migrati, e `php -S` dietro sulla 8081 per il resto. Niente XAMPP,
niente Apache, niente MySQL.

**Il confronto di parità è il collaudo della migrazione**: interroga PHP da
riga di comando (quindi senza login) e mette il risultato a fianco di quello
di Node. Ogni dominio spostato deve superarlo prima di considerarsi migrato.

## Stack

- **PHP 8.3**, MVC scritto a mano, nessun framework, **zero dipendenze Composer**
  a runtime.
- **SQLite** — un solo file, `data/my-expense.sqlite` (gitignored: contiene dati
  personali). Il backup è copiarlo.
- **Frontend server-rendered** con miglioramento progressivo: template PHP in
  `src/Views/templates/`, un modulo ES per pagina in `public/js/pages/`, librerie
  da CDN (Bootstrap, Chart.js, Tesseract.js). Nessun bundler.
- **Node 24** disponibile, con `node:sqlite` nella stdlib — è il motivo per cui
  la migrazione non avrà dipendenze native.

## Com'è organizzato

| Path | Ruolo |
|------|------|
| `public/index.php` | Front controller, delega a `App\Http\Kernel` |
| `public/router.php` | Router per `php -S`: sostituisce le RewriteRule di Apache |
| `routes/web.php`, `routes/api.php` | Route HTML e route JSON |
| `src/Http/` | Kernel, Router, Request, Response, Middleware |
| `src/Controllers/` | Un controller per dominio |
| `src/Services/` | Logica di business, transazioni fra entità |
| `src/Models/Repositories/` | Persistenza via PDO |
| `src/Models/Entities/` | POPO immutabili (`toArray()` per il JSON) |
| `src/Validation/` | Validator a regole + Request per dominio |
| `src/Views/` | Motore di template minimale + template per dominio |
| `server/` | Il backend Node: `index.js` (server e proxy verso PHP), `db.js`, `http.js`, `routes/` un file per dominio |
| `server/routes/index.js` | Registro degli endpoint su Node: quel che non è qui viene inoltrato a PHP |
| `tests/parity/` | Confronto fra le risposte di Node e quelle di PHP |
| `src/class/` | Infrastruttura (Auth, Csrf, Config, Database, Session, Json) e domini non ancora migrati a Repository |
| `database/schema.sql` | Schema SQLite completo — l'unica fonte |
| `config/config.php` | Configurazione locale, gitignored |

Il flusso: browser → `public/index.php` → `Kernel::handle()` → bootstrap
(config, sessione, CSRF) → `Router::dispatch()` → catena di middleware
(SetupGate → Auth → Csrf) → Controller → Service → Repository → Entity →
`Response`.

## Cose da sapere prima di toccare il codice

**Le foreign key di SQLite sono spente di default.** `Database::pdo()` esegue
`PRAGMA foreign_keys = ON` a ogni connessione: senza quella riga tutti i vincoli
dello schema smettono di valere in silenzio. Lo stesso pragma è un **no-op se
invocato a transazione aperta**, quindi in `DatabaseReset` e nel backup va
chiamato prima di `beginTransaction()`.

**Gli importi sono float.** SQLite non ha un tipo decimale, i `DECIMAL(12,2)`
sono diventati `NUMERIC`. Ogni aggregazione va arrotondata
(`ROUND(SUM(...), 2)`). Se servisse precisione esatta la strada è memorizzare i
centesimi come `INTEGER`, non cambiare database.

**`src/class/Expense.php` e `Income.php` esistono solo come percorso di scrittura
dell'import.** La loro `validate()` **non** coincide con
`ExpenseService::normalizeAndValidate()`, che pretende un conto cassa per i
pagamenti in contanti — regola che la legacy non ha. Unificarle senza tenerne
conto spezza l'import da estratto conto.

**Il JS legge chiavi precise dall'envelope.** `showBudgetWarning()` in
`public/js/pages/expenses.js` usa `exceeded` e `near_limit`: se un `toArray()`
smette di produrle, l'avviso sparisce senza errori. L'envelope è un contratto
col frontend.

**Le soglie si confrontano sui valori grezzi.** `Budget::nearLimit()` non usa
`progressPct()`, che è arrotondato a un decimale e farebbe scattare l'avviso già
a 79,95%.

**Gli arrotondamenti in Node passano da `roundLikePhp`.**
`Math.round(x * 100) / 100` non basta: `263.585 * 100` in virgola mobile fa
`26358.499999999996`, quindi JS arrotonda per difetto dove PHP arrotonda per
eccesso. La differenza è emersa su un dato vero — la media mensile di un anno.

**Anche i comportamenti discutibili vanno riprodotti, finché i due backend
convivono.** PHP legge `1.234,56` come **1.234**, perché non gestisce il
separatore delle migliaia (`server/amount.js`). Correggerlo in Node
significherebbe salvare lo stesso valore in modo diverso a seconda di chi
risponde alla richiesta.

## Convenzioni

- Codice e identificatori in inglese, commenti e testi dell'interfaccia in
  italiano. Adeguarsi al file in cui si sta scrivendo.
- Le aree autenticate usano `FetchRequest` + envelope JSON
  (`{ok: true, data}` / `{ok: false, error: {code, message}}`); `setup`, `login`
  e `logout` restano form POST perché precedono l'autenticazione.
- Modifiche allo schema: si aggiorna `database/schema.sql`. Un runner di
  migration idempotente arriverà col pacchetto Electron, dove serve davvero.
- Test dove la logica non è banale; sui percorsi che toccano denaro la
  correttezza viene prima della brevità.
- Ogni pezzo di lavoro finito e verificato va committato su `main`.
