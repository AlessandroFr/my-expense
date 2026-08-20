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
eliminati.

Da fare: sostituire PHP con Node un dominio alla volta (strangler: un server
`node:http` davanti che serve gli endpoint già migrati e inoltra gli altri a
`php -S`), poi impacchettare con `electron-builder`.

**Il frontend non va toccato.** `public/js/` (9.000 righe) parla col backend via
`fetch()` su un envelope JSON stabile: finché URL ed envelope restano quelli, il
passaggio a Node non richiede di riscriverlo. È la ragione per cui il server
HTTP locale resta anche dentro Electron, invece di passare a IPC.

## Comandi

```powershell
avvia.cmd                      # avvia l'app e apre la finestra
php vendor/bin/phpunit         # test PHP
npm test                       # test JS (node --test, zero dipendenze)
composer install               # dipendenze (l'autoload serve al front controller)
```

L'app parte con il web server integrato di PHP:
`php -S 127.0.0.1:8080 -t public public/router.php`. Niente XAMPP, niente
Apache, niente MySQL.

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
