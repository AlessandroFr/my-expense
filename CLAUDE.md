# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`my-expense` is a personal expense tracker the user is building from scratch.
As of 2026-05-02 the **schema + authentication layer is implemented**:

- `composer.json` exists (PSR-4 autoload of `App\` from `src/class/`)
- `database/schema.sql` defines a `users` table (single-user app for now)
- One-time setup page at `/setup` (active only when `users` is empty),
  login at `/login`, logout (POST) at `/logout`, protected dashboard
  placeholder at `/dashboard`
- Session-based auth, bcrypt password hashing, CSRF token (dual-source:
  hidden `_csrf` form field **and** `csrf_token` cookie consumed by
  `public/js/FetchRequest.js` as `X-CSRF-Token` header)

Expense tracking features (categories, entries, dashboard charts, budgets)
are not yet built — they will arrive in subsequent steps.

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
