-- ─── my-expense — schema SQLite ─────────────────────────────────────────────
--
-- Generato dallo stato reale del database (schema.sql MySQL non includeva le
-- colonne aggiunte dalle migration). Applicare con:
--   sqlite3 data/my-expense.sqlite < database/schema.sql
--
-- Note sulla traduzione:
--  · DECIMAL -> NUMERIC: SQLite non ha un tipo decimale. Gli importi sono
--    float, quindi ogni aggregato va arrotondato (ROUND(SUM(...), 2)).
--    Per precisione esatta servirebbero centesimi come INTEGER.
--  · ENUM -> TEXT + CHECK, stessi valori ammessi.
--  · ON UPDATE CURRENT_TIMESTAMP -> trigger AFTER UPDATE in fondo al file.
--  · Le FK valgono solo con PRAGMA foreign_keys = ON a ogni connessione:
--    in SQLite e' OFF di default (vedi src/class/Database.php).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS `users` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `username`               TEXT COLLATE NOCASE NOT NULL,
    `password_hash`          TEXT COLLATE NOCASE NOT NULL,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_login_at`          TEXT,
    `reset_token_hash`       TEXT COLLATE NOCASE,
    `reset_token_expires_at` TEXT,
    CONSTRAINT `uq_users_username` UNIQUE (`username`)
);

CREATE TABLE IF NOT EXISTS `accounts` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `type`                   TEXT COLLATE NOCASE NOT NULL DEFAULT 'checking' CHECK (`type` IN ('checking', 'card', 'cash', 'savings', 'investment', 'deposit', 'pac', 'other')),
    `color`                  TEXT COLLATE NOCASE NOT NULL DEFAULT '#6c757d',
    `icon`                   TEXT COLLATE NOCASE,
    `opening_balance`        NUMERIC NOT NULL DEFAULT 0.00,
    `iban`                   TEXT COLLATE NOCASE,
    `bic`                    TEXT COLLATE NOCASE,
    `bank_name`              TEXT COLLATE NOCASE,
    `account_holder`         TEXT COLLATE NOCASE,
    `account_number`         TEXT COLLATE NOCASE,
    `notes`                  TEXT COLLATE NOCASE,
    `archived`               INTEGER NOT NULL DEFAULT 0,
    `is_default_cash`        INTEGER NOT NULL DEFAULT 0,
    `bank_profile_id`        INTEGER,
    `sort_order`             INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_accounts_user_name` UNIQUE (`user_id`, `name`),
    CONSTRAINT `fk_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_accounts_bank_profile` FOREIGN KEY (`bank_profile_id`) REFERENCES `bank_profiles` (`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `ix_accounts_user_sort` ON `accounts` (`user_id`, `sort_order`);

CREATE TABLE IF NOT EXISTS `asset_classes` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `color`                  TEXT COLLATE NOCASE NOT NULL DEFAULT '#6c757d',
    `icon`                   TEXT COLLATE NOCASE,
    `sort_order`             INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_asset_classes_user_name` UNIQUE (`user_id`, `name`),
    CONSTRAINT `fk_asset_classes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_asset_classes_user_sort` ON `asset_classes` (`user_id`, `sort_order`);

CREATE TABLE IF NOT EXISTS `categories` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `color`                  TEXT COLLATE NOCASE NOT NULL DEFAULT '#6c757d',
    `icon`                   TEXT COLLATE NOCASE,
    `sort_order`             INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_categories_user_name` UNIQUE (`user_id`, `name`),
    CONSTRAINT `fk_categories_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_categories_user_sort` ON `categories` (`user_id`, `sort_order`);

CREATE TABLE IF NOT EXISTS `contacts` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `name_norm`              TEXT COLLATE NOCASE NOT NULL,
    `type`                   TEXT COLLATE NOCASE NOT NULL DEFAULT 'both' CHECK (`type` IN ('supplier', 'customer', 'both')),
    `vat_number`             TEXT COLLATE NOCASE,
    `iban`                   TEXT COLLATE NOCASE,
    `email`                  TEXT COLLATE NOCASE,
    `notes`                  TEXT COLLATE NOCASE,
    `color`                  TEXT COLLATE NOCASE NOT NULL DEFAULT '#6c757d',
    `archived`               INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_contacts_user_namenorm` UNIQUE (`user_id`, `name_norm`),
    CONSTRAINT `fk_contacts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_contacts_user_archived` ON `contacts` (`user_id`, `archived`);

-- Un tracciato di estratto conto per banca. Le righe preimpostate le crea il
-- codice al primo utilizzo, non c'e' semina SQL.
CREATE TABLE IF NOT EXISTS `bank_profiles` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `builtin_key`            TEXT COLLATE NOCASE,
    `delimiter`              TEXT NOT NULL DEFAULT 'auto',
    `encoding`               TEXT NOT NULL DEFAULT 'auto',
    `amount_mode`            TEXT NOT NULL DEFAULT 'auto',
    `date_order`             TEXT NOT NULL DEFAULT 'auto',
    `columns_json`           TEXT NOT NULL DEFAULT '{}',
    `notes`                  TEXT COLLATE NOCASE,
    `sort_order`             INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_bank_profiles_user_name` UNIQUE (`user_id`, `name`),
    CONSTRAINT `uq_bank_profiles_user_builtin` UNIQUE (`user_id`, `builtin_key`),
    CONSTRAINT `fk_bank_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_bank_profiles_user_sort` ON `bank_profiles` (`user_id`, `sort_order`);

CREATE TABLE IF NOT EXISTS `pac_funds` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `asset_class_id`         INTEGER,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `isin`                   TEXT COLLATE NOCASE,
    `fund_type`              TEXT COLLATE NOCASE NOT NULL DEFAULT 'etf' CHECK (`fund_type` IN ('etf', 'mutual', 'index', 'other')),
    `currency`               TEXT COLLATE NOCASE NOT NULL DEFAULT 'EUR',
    `notes`                  TEXT COLLATE NOCASE,
    `archived`               INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_pac_funds_user_isin` UNIQUE (`user_id`, `isin`),
    CONSTRAINT `uq_pac_funds_user_name` UNIQUE (`user_id`, `name`),
    CONSTRAINT `fk_pac_funds_class` FOREIGN KEY (`asset_class_id`) REFERENCES `asset_classes` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_pac_funds_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_pac_funds_class` ON `pac_funds` (`asset_class_id`);
CREATE INDEX IF NOT EXISTS `ix_pac_funds_user_class` ON `pac_funds` (`user_id`, `asset_class_id`);

CREATE TABLE IF NOT EXISTS `pac_plans` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `account_id`             INTEGER NOT NULL,
    `source_account_id`      INTEGER,
    `fund_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `frequency`              TEXT COLLATE NOCASE NOT NULL DEFAULT 'monthly' CHECK (`frequency` IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    `amount`                 NUMERIC NOT NULL,
    `start_date`             TEXT NOT NULL,
    `end_date`               TEXT,
    `last_generated_date`    TEXT,
    `beneficiary_iban`       TEXT COLLATE NOCASE,
    `beneficiary_keyword`    TEXT COLLATE NOCASE,
    `active`                 INTEGER NOT NULL DEFAULT 1,
    `notes`                  TEXT COLLATE NOCASE,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_pac_plans_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_plans_fund` FOREIGN KEY (`fund_id`) REFERENCES `pac_funds` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_plans_source` FOREIGN KEY (`source_account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_pac_plans_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_pac_plans_account` ON `pac_plans` (`account_id`);
CREATE INDEX IF NOT EXISTS `fk_pac_plans_fund` ON `pac_plans` (`fund_id`);
CREATE INDEX IF NOT EXISTS `fk_pac_plans_source` ON `pac_plans` (`source_account_id`);
CREATE INDEX IF NOT EXISTS `ix_pac_plans_keyword` ON `pac_plans` (`user_id`, `beneficiary_keyword`);
CREATE INDEX IF NOT EXISTS `ix_pac_plans_user_account` ON `pac_plans` (`user_id`, `account_id`);
CREATE INDEX IF NOT EXISTS `ix_pac_plans_user_active` ON `pac_plans` (`user_id`, `active`);
CREATE INDEX IF NOT EXISTS `ix_pac_plans_user_fund` ON `pac_plans` (`user_id`, `fund_id`);

CREATE TABLE IF NOT EXISTS `recurring_expenses` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `category_id`            INTEGER,
    `contact_id`             INTEGER,
    `account_id`             INTEGER,
    `amount`                 NUMERIC NOT NULL,
    `description`            TEXT COLLATE NOCASE,
    `payment_method`         TEXT COLLATE NOCASE NOT NULL DEFAULT 'card' CHECK (`payment_method` IN ('cash', 'card', 'transfer', 'other')),
    `frequency`              TEXT COLLATE NOCASE NOT NULL DEFAULT 'monthly' CHECK (`frequency` IN ('weekly', 'monthly', 'yearly')),
    `start_date`             TEXT NOT NULL,
    `end_date`               TEXT,
    `last_generated_date`    TEXT,
    `active`                 INTEGER NOT NULL DEFAULT 1,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_recurring_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_recurring_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_recurring_contact` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_recurring_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_recurring_account` ON `recurring_expenses` (`account_id`);
CREATE INDEX IF NOT EXISTS `fk_recurring_category` ON `recurring_expenses` (`category_id`);
CREATE INDEX IF NOT EXISTS `fk_recurring_contact` ON `recurring_expenses` (`contact_id`);
CREATE INDEX IF NOT EXISTS `ix_recurring_user_account` ON `recurring_expenses` (`user_id`, `account_id`);
CREATE INDEX IF NOT EXISTS `ix_recurring_user_active` ON `recurring_expenses` (`user_id`, `active`);
CREATE INDEX IF NOT EXISTS `ix_recurring_user_contact` ON `recurring_expenses` (`user_id`, `contact_id`);

CREATE TABLE IF NOT EXISTS `saved_filters` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `scope`                  TEXT COLLATE NOCASE NOT NULL DEFAULT 'expenses',
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `payload`                TEXT COLLATE NOCASE NOT NULL,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_saved_filters_user_scope_name` UNIQUE (`user_id`, `scope`, `name`),
    CONSTRAINT `fk_saved_filters_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `securities_instruments` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `account_id`             INTEGER,
    `asset_class_id`         INTEGER,
    `isin`                   TEXT COLLATE NOCASE,
    `ticker`                 TEXT COLLATE NOCASE,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `currency`               TEXT COLLATE NOCASE NOT NULL DEFAULT 'EUR',
    `notes`                  TEXT COLLATE NOCASE,
    `archived`               INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_securities_user_isin` UNIQUE (`user_id`, `isin`),
    CONSTRAINT `uq_securities_user_ticker` UNIQUE (`user_id`, `ticker`),
    CONSTRAINT `fk_securities_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_securities_class` FOREIGN KEY (`asset_class_id`) REFERENCES `asset_classes` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_securities_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_securities_account` ON `securities_instruments` (`account_id`);
CREATE INDEX IF NOT EXISTS `fk_securities_class` ON `securities_instruments` (`asset_class_id`);
CREATE INDEX IF NOT EXISTS `ix_securities_user_account` ON `securities_instruments` (`user_id`, `account_id`);
CREATE INDEX IF NOT EXISTS `ix_securities_user_class` ON `securities_instruments` (`user_id`, `asset_class_id`);

CREATE TABLE IF NOT EXISTS `securities_prices` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `instrument_id`          INTEGER NOT NULL,
    `price_date`             TEXT NOT NULL,
    `price`                  NUMERIC NOT NULL,
    `source`                 TEXT COLLATE NOCASE NOT NULL DEFAULT 'manual' CHECK (`source` IN ('manual', 'external')),
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_prices_instr_date` UNIQUE (`instrument_id`, `price_date`),
    CONSTRAINT `fk_prices_instr` FOREIGN KEY (`instrument_id`) REFERENCES `securities_instruments` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `tags` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `color`                  TEXT COLLATE NOCASE NOT NULL DEFAULT '#6c757d',
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_tags_user_name` UNIQUE (`user_id`, `name`),
    CONSTRAINT `fk_tags_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `transfers` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `source_account_id`      INTEGER NOT NULL,
    `destination_account_id` INTEGER NOT NULL,
    `amount`                 NUMERIC NOT NULL,
    `transfer_date`          TEXT NOT NULL,
    `description`            TEXT COLLATE NOCASE,
    `notes`                  TEXT COLLATE NOCASE,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_transfers_destination` FOREIGN KEY (`destination_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transfers_source` FOREIGN KEY (`source_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transfers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_transfers_destination` ON `transfers` (`destination_account_id`);
CREATE INDEX IF NOT EXISTS `fk_transfers_source` ON `transfers` (`source_account_id`);
CREATE INDEX IF NOT EXISTS `ix_transfers_user_date` ON `transfers` (`user_id`, `transfer_date`);
CREATE INDEX IF NOT EXISTS `ix_transfers_user_dst` ON `transfers` (`user_id`, `destination_account_id`);
CREATE INDEX IF NOT EXISTS `ix_transfers_user_src` ON `transfers` (`user_id`, `source_account_id`);

CREATE TABLE IF NOT EXISTS `budgets` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `category_id`            INTEGER NOT NULL,
    `year_month`             TEXT COLLATE NOCASE NOT NULL,
    `amount`                 NUMERIC NOT NULL,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_budgets_user_cat_month` UNIQUE (`user_id`, `category_id`, `year_month`),
    CONSTRAINT `fk_budgets_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_budgets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_budgets_category` ON `budgets` (`category_id`);
CREATE INDEX IF NOT EXISTS `ix_budgets_user_month` ON `budgets` (`user_id`, `year_month`);

CREATE TABLE IF NOT EXISTS `expenses` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `category_id`            INTEGER,
    `contact_id`             INTEGER,
    `account_id`             INTEGER,
    `amount`                 NUMERIC NOT NULL,
    `description`            TEXT COLLATE NOCASE,
    `shared_with`            TEXT COLLATE NOCASE,
    `share_amount`           NUMERIC,
    `payment_method`         TEXT COLLATE NOCASE NOT NULL DEFAULT 'card' CHECK (`payment_method` IN ('cash', 'card', 'transfer', 'other')),
    `expense_date`           TEXT NOT NULL,
    `value_date`             TEXT,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `import_hash`            TEXT COLLATE NOCASE,
    `parent_expense_id`      INTEGER,
    `installment_seq`        INTEGER,
    `installment_total`      INTEGER,
    `transfer_id`            INTEGER,
    `is_transfer`            INTEGER NOT NULL DEFAULT 0,
    `is_investment`          INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT `uq_expenses_transfer` UNIQUE (`transfer_id`),
    CONSTRAINT `uq_expenses_user_imphash` UNIQUE (`user_id`, `import_hash`),
    CONSTRAINT `fk_expenses_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_expenses_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_expenses_contact` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_expenses_parent` FOREIGN KEY (`parent_expense_id`) REFERENCES `expenses` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_expenses_transfer` FOREIGN KEY (`transfer_id`) REFERENCES `transfers` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_expenses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_expenses_account` ON `expenses` (`account_id`);
CREATE INDEX IF NOT EXISTS `fk_expenses_category` ON `expenses` (`category_id`);
CREATE INDEX IF NOT EXISTS `fk_expenses_contact` ON `expenses` (`contact_id`);
CREATE INDEX IF NOT EXISTS `ix_expenses_parent` ON `expenses` (`parent_expense_id`);
CREATE INDEX IF NOT EXISTS `ix_expenses_user_account` ON `expenses` (`user_id`, `account_id`);
CREATE INDEX IF NOT EXISTS `ix_expenses_user_cat` ON `expenses` (`user_id`, `category_id`);
CREATE INDEX IF NOT EXISTS `ix_expenses_user_contact` ON `expenses` (`user_id`, `contact_id`);
CREATE INDEX IF NOT EXISTS `ix_expenses_user_date` ON `expenses` (`user_id`, `expense_date`);
CREATE INDEX IF NOT EXISTS `ix_expenses_user_date_cat` ON `expenses` (`user_id`, `expense_date`, `category_id`);

CREATE TABLE IF NOT EXISTS `incomes` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `contact_id`             INTEGER,
    `account_id`             INTEGER,
    `source`                 TEXT COLLATE NOCASE NOT NULL,
    `description`            TEXT COLLATE NOCASE,
    `amount`                 NUMERIC NOT NULL,
    `payment_method`         TEXT COLLATE NOCASE NOT NULL DEFAULT 'transfer' CHECK (`payment_method` IN ('cash', 'card', 'transfer', 'other')),
    `income_date`            TEXT NOT NULL,
    `value_date`             TEXT,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `import_hash`            TEXT COLLATE NOCASE,
    `transfer_id`            INTEGER,
    `is_transfer`            INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT `uq_incomes_transfer` UNIQUE (`transfer_id`),
    CONSTRAINT `uq_incomes_user_imphash` UNIQUE (`user_id`, `import_hash`),
    CONSTRAINT `fk_incomes_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_incomes_contact` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_incomes_transfer` FOREIGN KEY (`transfer_id`) REFERENCES `transfers` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_incomes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_incomes_account` ON `incomes` (`account_id`);
CREATE INDEX IF NOT EXISTS `fk_incomes_contact` ON `incomes` (`contact_id`);
CREATE INDEX IF NOT EXISTS `ix_incomes_user_account` ON `incomes` (`user_id`, `account_id`);
CREATE INDEX IF NOT EXISTS `ix_incomes_user_contact` ON `incomes` (`user_id`, `contact_id`);
CREATE INDEX IF NOT EXISTS `ix_incomes_user_date` ON `incomes` (`user_id`, `income_date`);
CREATE INDEX IF NOT EXISTS `ix_incomes_user_source` ON `incomes` (`user_id`, `source`);

CREATE TABLE IF NOT EXISTS `pac_contributions` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `plan_id`                INTEGER NOT NULL,
    `contribution_date`      TEXT NOT NULL,
    `amount`                 NUMERIC NOT NULL,
    `nav`                    NUMERIC,
    `units`                  NUMERIC,
    `transfer_id`            INTEGER,
    `source`                 TEXT COLLATE NOCASE NOT NULL DEFAULT 'manual' CHECK (`source` IN ('auto', 'manual', 'import')),
    `notes`                  TEXT COLLATE NOCASE,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_pac_contrib_plan_date` UNIQUE (`plan_id`, `contribution_date`),
    CONSTRAINT `fk_pac_contrib_plan` FOREIGN KEY (`plan_id`) REFERENCES `pac_plans` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_contrib_transfer` FOREIGN KEY (`transfer_id`) REFERENCES `transfers` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_pac_contrib_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_pac_contrib_transfer` ON `pac_contributions` (`transfer_id`);
CREATE INDEX IF NOT EXISTS `ix_pac_contrib_user_date` ON `pac_contributions` (`user_id`, `contribution_date`);

CREATE TABLE IF NOT EXISTS `pac_fund_navs` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `fund_id`                INTEGER NOT NULL,
    `nav_date`               TEXT NOT NULL,
    `nav`                    NUMERIC NOT NULL,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_pac_navs_fund_date` UNIQUE (`fund_id`, `nav_date`),
    CONSTRAINT `fk_pac_navs_fund` FOREIGN KEY (`fund_id`) REFERENCES `pac_funds` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `securities_transactions` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `account_id`             INTEGER NOT NULL,
    `instrument_id`          INTEGER NOT NULL,
    `kind`                   TEXT COLLATE NOCASE NOT NULL CHECK (`kind` IN ('BUY', 'SELL', 'DIVIDEND', 'FEE', 'SPLIT')),
    `trade_date`             TEXT NOT NULL,
    `settlement_date`        TEXT,
    `quantity`               NUMERIC NOT NULL DEFAULT 0.000000,
    `price`                  NUMERIC NOT NULL DEFAULT 0.000000,
    `fee`                    NUMERIC NOT NULL DEFAULT 0.00,
    `gross_amount`           NUMERIC NOT NULL DEFAULT 0.00,
    `net_amount`             NUMERIC NOT NULL DEFAULT 0.00,
    `tax_withheld`           NUMERIC NOT NULL DEFAULT 0.00,
    `expense_id`             INTEGER,
    `income_id`              INTEGER,
    `notes`                  TEXT COLLATE NOCASE,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_sectx_expense` UNIQUE (`expense_id`),
    CONSTRAINT `uq_sectx_income` UNIQUE (`income_id`),
    CONSTRAINT `fk_sectx_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_expense` FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_sectx_income` FOREIGN KEY (`income_id`) REFERENCES `incomes` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_sectx_instrument` FOREIGN KEY (`instrument_id`) REFERENCES `securities_instruments` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_sectx_account` ON `securities_transactions` (`account_id`);
CREATE INDEX IF NOT EXISTS `ix_sectx_instrument_date` ON `securities_transactions` (`instrument_id`, `trade_date`);
CREATE INDEX IF NOT EXISTS `ix_sectx_user_account_date` ON `securities_transactions` (`user_id`, `account_id`, `trade_date`);
CREATE INDEX IF NOT EXISTS `ix_sectx_user_kind_date` ON `securities_transactions` (`user_id`, `kind`, `trade_date`);

CREATE TABLE IF NOT EXISTS `account_reconciliations` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `account_id`             INTEGER NOT NULL,
    `reconciled_at`          TEXT NOT NULL,
    `declared_balance`       NUMERIC NOT NULL,
    `calculated_balance`     NUMERIC NOT NULL,
    `difference`             NUMERIC NOT NULL,
    `adjustment_type`        TEXT COLLATE NOCASE NOT NULL DEFAULT 'none' CHECK (`adjustment_type` IN ('expense', 'income', 'none')),
    `adjustment_expense_id`  INTEGER,
    `adjustment_income_id`   INTEGER,
    `notes`                  TEXT COLLATE NOCASE,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_recon_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_recon_expense` FOREIGN KEY (`adjustment_expense_id`) REFERENCES `expenses` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_recon_income` FOREIGN KEY (`adjustment_income_id`) REFERENCES `incomes` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_recon_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `fk_recon_account` ON `account_reconciliations` (`account_id`);
CREATE INDEX IF NOT EXISTS `fk_recon_expense` ON `account_reconciliations` (`adjustment_expense_id`);
CREATE INDEX IF NOT EXISTS `fk_recon_income` ON `account_reconciliations` (`adjustment_income_id`);
CREATE INDEX IF NOT EXISTS `ix_recon_user_account` ON `account_reconciliations` (`user_id`, `account_id`, `reconciled_at`);

CREATE TABLE IF NOT EXISTS `expense_attachments` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `expense_id`             INTEGER NOT NULL,
    `user_id`                INTEGER NOT NULL,
    `original_name`          TEXT COLLATE NOCASE NOT NULL,
    `stored_name`            TEXT COLLATE NOCASE NOT NULL,
    `mime_type`              TEXT COLLATE NOCASE NOT NULL,
    `size_bytes`             INTEGER NOT NULL,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_attachments_expense` FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_attachments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_attachments_expense` ON `expense_attachments` (`expense_id`);
CREATE INDEX IF NOT EXISTS `ix_attachments_user` ON `expense_attachments` (`user_id`);

CREATE TABLE IF NOT EXISTS `expense_tags` (
    `expense_id`             INTEGER NOT NULL,
    `tag_id`                 INTEGER NOT NULL,
    PRIMARY KEY (`expense_id`, `tag_id`),
    CONSTRAINT `fk_expense_tags_expense` FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_expense_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_expense_tags_tag` ON `expense_tags` (`tag_id`);

-- ── updated_at: in MySQL era ON UPDATE CURRENT_TIMESTAMP ────────────────────

CREATE TRIGGER IF NOT EXISTS `tr_users_updated_at`
AFTER UPDATE ON `users` FOR EACH ROW
BEGIN
    UPDATE `users` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_accounts_updated_at`
AFTER UPDATE ON `accounts` FOR EACH ROW
BEGIN
    UPDATE `accounts` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_asset_classes_updated_at`
AFTER UPDATE ON `asset_classes` FOR EACH ROW
BEGIN
    UPDATE `asset_classes` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_categories_updated_at`
AFTER UPDATE ON `categories` FOR EACH ROW
BEGIN
    UPDATE `categories` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_contacts_updated_at`
AFTER UPDATE ON `contacts` FOR EACH ROW
BEGIN
    UPDATE `contacts` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_pac_funds_updated_at`
AFTER UPDATE ON `pac_funds` FOR EACH ROW
BEGIN
    UPDATE `pac_funds` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_pac_plans_updated_at`
AFTER UPDATE ON `pac_plans` FOR EACH ROW
BEGIN
    UPDATE `pac_plans` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_recurring_expenses_updated_at`
AFTER UPDATE ON `recurring_expenses` FOR EACH ROW
BEGIN
    UPDATE `recurring_expenses` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_securities_instruments_updated_at`
AFTER UPDATE ON `securities_instruments` FOR EACH ROW
BEGIN
    UPDATE `securities_instruments` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_transfers_updated_at`
AFTER UPDATE ON `transfers` FOR EACH ROW
BEGIN
    UPDATE `transfers` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_budgets_updated_at`
AFTER UPDATE ON `budgets` FOR EACH ROW
BEGIN
    UPDATE `budgets` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_expenses_updated_at`
AFTER UPDATE ON `expenses` FOR EACH ROW
BEGIN
    UPDATE `expenses` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_incomes_updated_at`
AFTER UPDATE ON `incomes` FOR EACH ROW
BEGIN
    UPDATE `incomes` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_securities_transactions_updated_at`
AFTER UPDATE ON `securities_transactions` FOR EACH ROW
BEGIN
    UPDATE `securities_transactions` SET `updated_at` = CURRENT_TIMESTAMP WHERE `rowid` = NEW.`rowid`;
END;
