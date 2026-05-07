# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`my-expense` is a personal expense tracker. **Phase 4 complete (2026-05-02)** —
MVP + budgets + incomes + recurring + CSV (fase 2) + warnings + tags + reports +
attachments (fase 3) + multi-account, saved searches, expense splitting,
dark mode, PWA installable + offline cache, full ZIP backup, client-side OCR
(fase 4).

- `composer.json` (PSR-4 autoload of `App\` from `src/class/`)
- `database/schema.sql` cumulative + numbered migrations in `database/migrations/`
  (`001_categories.sql`, `002_expenses.sql`, `003_budgets.sql`,
  `004_incomes.sql`, `005_recurring_expenses.sql`, `006_tags.sql`,
  `007_attachments.sql`, `008_accounts.sql`, `009_saved_filters.sql`,
  `010_expense_split.sql`, `011_bank_import.sql`)
- **Auth**: one-time setup at `/setup`, login at `/login`, POST logout, session
  + bcrypt + dual-source CSRF (hidden `_csrf` field + `csrf_token` cookie consumed
  by `public/js/FetchRequest.js` as `X-CSRF-Token` header)
- **Categorie** (`/categories`, `/categories/edit?id=N`): per-user CRUD with name
  (UNIQUE per user), color, Bootstrap Icon, sort order; AJAX via FetchRequest +
  JSON envelope (`App\Json::ok` / `App\Json::error`)
- **Spese** (`/expenses`): full CRUD with inline create form, inline row edit,
  delete with confirm; filter bar (date range, category, amount min/max,
  text search, debounced); JOIN to categories with color/icon. **CSV
  import/export** (UTF-8 BOM + `;` separator; header
  `Data;Categoria;Descrizione;Importo;Pagamento`; auto-creates missing
  categories; tolerant of `DD/MM/YYYY`, `,` decimal, IT payment labels).
- **Entrate** (`/incomes`): mirror of expenses with free-form `source` field
  (Stipendio/Freelance/Rimborso ecc.); same filter bar + inline CRUD.
- **Budget mensili** (`/budgets`): set per-category cap per month (`YYYY-MM`),
  view real-time progress bars (green <80% / yellow ≥80% / red ≥100%); also
  rendered on dashboard for current month.
- **Spese ricorrenti** (`/recurring`): templates (weekly/monthly/yearly) with
  optional end date; `App\RecurringExpense::generatePending()` runs on every
  `GET /dashboard` request and inserts pending occurrences into `expenses`,
  idempotent via `last_generated_date`. Manual "Genera ora" button available.
- **Dashboard** (`/dashboard`): 4 KPI cards (Spese mese / Entrate mese /
  Bilancio netto / Variazione spese%), Chart.js doughnut (by category),
  dual-bar chart (spese rosso + entrate verdi, ultimi 6 mesi), budget
  progress widget.
- **Tag liberi**: tabelle `tags` + `expense_tags` (many-to-many); `App\Tag`
  classe con `setForExpense($expenseId, $userId, $names)` che fa upsert dei
  nomi. UI in `/expenses`: input testuale CSV con datalist autocomplete dai
  tag esistenti; chip colorate nelle righe; filtro select per tag.
  `Expense::listForUser` espone `tags` per riga via batch query.
- **Budget warnings**: `App\Budget::checkForCategory()` chiamato dopo
  `expenses/create` e `expenses/update`; il JSON envelope espone
  `data.budget_warning` `{name, amount, spent, progress_pct, exceeded,
  near_limit}`. Frontend mostra `toast.warning` a >=80% e `toast.error` a
  >100%.
- **Report annuale** (`/reports`): selettore anno + 4 KPI (spese tot /
  entrate tot / bilancio anno / media mensile), Chart.js bar+line (spese
  rosse + entrate verdi + linea bilancio blu), doughnut categorie anno,
  heatmap top-5 categorie x 12 mesi (alpha proporzionale al massimo),
  top-10 spese singole.
- **Allegati spese**: tabella `expense_attachments`; storage filesystem in
  `{root}/uploads/expenses/{user_id}/{stored_name}` (uploads/ ha .htaccess
  `deny from all`, file gitignored, accessibili solo via endpoint
  `/attachments/download?id=N` con auth + ownership check). Whitelist mime:
  jpg/png/gif/webp/pdf, max 8 MB. Bottone clip in ogni riga di `/expenses`
  apre modal con upload + lista + view/download/delete.
- **Multi-conto** (`/accounts`): tabella `accounts` + colonna `account_id`
  su expenses/incomes/recurring (FK SET NULL). Saldo live = opening + entrate
  - spese (calcolato a runtime in `Account::withBalances()`). Tipi: checking/
  card/cash/savings/other. Archivio invece di delete per preservare la
  history. Filtro Conto in `/expenses`.
- **Saved filters**: tabella `saved_filters` (user, scope, name, payload JSON).
  Dropdown in toolbar `/expenses`: salva combinazione filtri corrente come
  preset, applica con un click, elimina.
- **Splitting**: colonne `shared_with` (string informale) + `share_amount`
  (DECIMAL) su `expenses`. Se `share_amount` è impostato è la tua quota
  effettiva; `amount` resta il totale dello scontrino. Badge `<i bi-people>`
  nelle righe.
- **Dark mode**: toggle in navbar (light/dark/auto) con persistenza via
  `localStorage[mx-theme]`. Bootstrap 5.3 `data-bs-theme`. Inline script in
  `<head>` previene FOUC. `js/theme.js` reagisce a system change quando in
  modalità auto.
- **PWA**: `public/manifest.webmanifest` + `public/sw.js` (cache-first per
  asset CDN, network-first per HTML/JSON, fallback offline). Service worker
  registrato da `layout.php`. Installable via Chrome/Edge/Safari "Install".
- **Backup ZIP** (`GET /backup/download`): icona cloud-download in navbar.
  `App\BackupService` produce `dump.sql` con INSERT statements scoped per
  user_id su tutte le 11 tabelle + cartella `uploads/{user_id}/` zippata
  via `ZipArchive`. Fallback `.sql` only se l'estensione manca.
- **OCR scontrini**: `js/ocr.js` lazy-load Tesseract.js da CDN (ita+eng).
  Bottone "Scansiona scontrino" nel create form di `/expenses` apre file
  picker (con `capture=environment` su mobile per camera). Estrae importo
  più grande (regex `\d+[.,]\d{2}`) e data (DD/MM/YYYY o YYYY-MM-DD),
  pre-popola i campi.
- **Reset DB** (`/settings` → "Zona pericolosa", `POST /db/reset`):
  cancellazione scoped sull'utente loggato (`App\DatabaseReset`) in 3 ambiti:
  `movements` (spese, entrate, expense_tags, expense_attachments + file su
  disco), `movements_recurring` (come sopra + reset `last_generated_date`
  sulle ricorrenti), `all` (tabula rasa di tutte le 10 tabelle user-scoped
  tranne `users`). Protetto da: 1) backup ZIP scaricato in tab nuova
  (gating client-side), 2) frase letterale `ELIMINA TUTTO`, 3)
  re-inserimento password (`Auth::verifyPassword`). Tutte le DELETE in
  un'unica transazione con `FOREIGN_KEY_CHECKS=0`; pulizia filesystem
  best-effort dopo il commit.
- **Import estratto conto bancario** (`POST /import/bank-statement`,
  modal "Estratto conto" su `/expenses`): parser per CSV Banca Sella /
  Patavina (`App\BankStatementImporter`). Encoding Windows-1252 auto-rilevato
  e convertito in UTF-8. Trova header
  `Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate`
  saltando metadata account. Per riga: `Uscite` → Expense (categoria via
  Tipologia + MCC code), `Entrate` → Income (source = "Stipendio" /
  "Bonifico da NOME" / "P2P" / ecc.). Le righe `RICARICA/RIMBORSO CARTA/E
  PREPAGATA/E` generano **partita doppia** (opzionale, default ON):
  expense sul conto sorgente + income su account "Carta Prepagata"
  (auto-creato se mancante). Account selector obbligatorio nella modal.
  Migration `011_bank_import.sql` aggiunge colonne `value_date` (data
  valuta della banca, distinta da `expense_date` che resta data operazione)
  e `import_hash` (SHA-256 con UNIQUE su `(user_id, hash)`) su
  expenses/incomes — re-import dello stesso file è idempotente, le righe
  duplicate vengono saltate e contate come `skipped_duplicate`. Mapping MCC
  → categoria in `BankStatementImporter::MCC_MAP` (5411=Spesa,
  5812/5814=Ristorazione, 5912=Farmacia, 5541/5542=Carburante, 7941=Sport,
  ecc.). Le commissioni 1€ delle ricariche restano spese normali categoria
  "Commissioni bancarie".

**Conventions**:

- Auth areas use `FetchRequest` + JSON envelope (`{ok: true, data: {...}}` /
  `{ok: false, error: {code, message}}`); `setup`/`login`/`logout` stay form-POST
  (pre-auth, no JS).
- DB changes: structure → numbered migration in `database/migrations/` **and**
  cumulative update of `database/schema.sql`; data → seed in `database/seeds/`.
- After every change: deploy to `C:\xampp\htdocs\my-expense\` (robocopy with
  exclusions: `.git`, `.claude`, `node_modules`, `CLAUDE.md`, `.gitignore`) and
  create a git commit.

The application runs **locally on XAMPP** (Apache + MySQL/MariaDB + PHP).
There is no separate `php -S` or Docker workflow.

## Stack

- **PHP + Composer**, PSR-4 autoload of domain classes from `src/class/`
- **MySQL / MariaDB** via XAMPP — schema in `database/schema.sql`,
  history in `database/migrations/`, fixtures in `database/seeds/`
- **Hybrid frontend** — server-rendered PHP pages composed of reusable
  components in `public/components/`, progressively enhanced with vanilla
  JS in `public/js/` that calls AJAX endpoints in `public/endpoints/`

## Directory layout

| Path | Role |
|------|------|
| `public/index.php` | Front controller — every HTTP request enters here |
| `public/pages/` | Full-page PHP templates (HTML responses) |
| `public/components/` | Reusable PHP partials included by pages |
| `public/endpoints/` | JSON / AJAX endpoints called from `public/js/` |
| `public/js/` | Vanilla JS that hydrates the server-rendered pages |
| `src/class/` | PHP domain classes (PSR-4 autoloaded via Composer) |
| `config/` | App config — DB credentials, environment |
| `database/schema.sql` | Authoritative MySQL schema |
| `database/migrations/` | Schema change history |
| `database/seeds/` | Test / development fixtures |
| `logs/` | Runtime application log output |
| `vendor/` | Composer dependencies (gitignore once `composer.json` lands) |

## Architecture flow

Browser → `public/index.php` (front controller) → routes the request to
either a page in `public/pages/` (HTML response) or an endpoint in
`public/endpoints/` (JSON response). Both pull domain logic from
`src/class/` and render shared UI fragments from `public/components/`.
JS in `public/js/` is loaded by pages and calls back into
`public/endpoints/` for asynchronous interactions.

## Local dev (XAMPP)

The repo lives outside `htdocs/`, so configure Apache to serve `public/`
as the docroot:

- Add a vhost in `xampp\apache\conf\extra\httpd-vhosts.conf`, or alias
  `c:\Users\perso\OneDrive\Sviluppo Programmi\my-expense\public` from
  `htdocs`.
- Start Apache + MySQL via the XAMPP control panel.
- Bootstrap the database: import `database/schema.sql` via phpMyAdmin
  or `mysql -u root <db_name> < database/schema.sql` (once the file
  has content).
- Application logs land in `logs/`; XAMPP's own Apache + PHP error logs
  sit under the XAMPP install directory.

## Commands

- **Install dependencies:** `composer install` (autoload is generated
  from `composer.json` — needed before the front controller works)
- **Import schema:** import `database/schema.sql` once via phpMyAdmin or
  `mysql -u root my_expense < database/schema.sql`. The front controller
  shows a friendly error page until the DB is initialised.
- **First run:** with the DB empty, any URL redirects to `/setup` for
  one-time user registration. After that the page is disabled forever.
- **Tests:** no test runner is wired up yet — ask the user before
  introducing PHPUnit / Pest.
- **Lint:** none configured.

## Workflow expectations

The user has set two recurring rules for this project:

1. **After every change, deploy to production.** The production target
   is not yet defined — ask the user the first time a change requires
   deploy, then record the answer as a project memory.
2. **After every change, create a git commit** with a meaningful message
   summarizing what changed.

A change is not considered complete until both steps have run, or the
user has explicitly deferred them.
