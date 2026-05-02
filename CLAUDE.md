# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`my-expense` is a personal expense tracker. **Phase 2 complete (2026-05-02)** —
beyond MVP: budget per category, income tracking, recurring expenses with
auto-generator, CSV import/export.

- `composer.json` (PSR-4 autoload of `App\` from `src/class/`)
- `database/schema.sql` cumulative + numbered migrations in `database/migrations/`
  (`001_categories.sql`, `002_expenses.sql`, `003_budgets.sql`,
  `004_incomes.sql`, `005_recurring_expenses.sql`)
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
