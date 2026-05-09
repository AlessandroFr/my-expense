-- ─── my-expense — schema cumulativo ──────────────────────────────────────────
-- Importa con: mysql -u root my_expense < database/schema.sql
-- Oppure da phpMyAdmin: Crea il DB `my_expense`, poi Import → seleziona questo file.
--
-- Questo file rappresenta lo STATO FINALE dello schema (tutte le tabelle dopo
-- aver applicato tutte le migration in database/migrations/). Mantienilo in sync
-- ogni volta che aggiungi una migration.

CREATE DATABASE IF NOT EXISTS `my_expense`
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE `my_expense`;

-- ── Utenti (singolo utente per ora; schema pronto per multi se in futuro) ────
CREATE TABLE IF NOT EXISTS `users` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username`       VARCHAR(64)  NOT NULL,
    `password_hash`  VARCHAR(255) NOT NULL,
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `last_login_at`  DATETIME     NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Categorie spese (per-utente, con colore + icona + ordine) ────────────────
-- Migration: 001_categories.sql
CREATE TABLE IF NOT EXISTS `categories` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `name`       VARCHAR(64)  NOT NULL,
    `color`      VARCHAR(7)   NOT NULL DEFAULT '#6c757d',
    `icon`       VARCHAR(32)  NULL,
    `sort_order` INT          NOT NULL DEFAULT 0,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_categories_user_name` (`user_id`, `name`),
    KEY `ix_categories_user_sort` (`user_id`, `sort_order`),
    CONSTRAINT `fk_categories_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Voci di spesa ────────────────────────────────────────────────────────────
-- Migration: 002_expenses.sql
CREATE TABLE IF NOT EXISTS `expenses` (
    `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`        INT UNSIGNED   NOT NULL,
    `category_id`    INT UNSIGNED   NULL,
    `amount`         DECIMAL(12,2)  NOT NULL,
    `description`    TEXT           NULL,
    `payment_method` ENUM('cash','card','transfer','other') NOT NULL DEFAULT 'card',
    `expense_date`   DATE           NOT NULL,
    `created_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_expenses_user_date`     (`user_id`, `expense_date` DESC),
    KEY `ix_expenses_user_cat`      (`user_id`, `category_id`),
    KEY `ix_expenses_user_date_cat` (`user_id`, `expense_date`, `category_id`),
    CONSTRAINT `fk_expenses_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_expenses_category`
        FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Budget mensili per categoria ─────────────────────────────────────────────
-- Migration: 003_budgets.sql
CREATE TABLE IF NOT EXISTS `budgets` (
    `id`          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`     INT UNSIGNED   NOT NULL,
    `category_id` INT UNSIGNED   NOT NULL,
    `year_month`  CHAR(7)        NOT NULL,
    `amount`      DECIMAL(12,2)  NOT NULL,
    `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_budgets_user_cat_month` (`user_id`, `category_id`, `year_month`),
    KEY `ix_budgets_user_month` (`user_id`, `year_month`),
    CONSTRAINT `fk_budgets_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_budgets_category`
        FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Entrate (income) ─────────────────────────────────────────────────────────
-- Migration: 004_incomes.sql
CREATE TABLE IF NOT EXISTS `incomes` (
    `id`          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`     INT UNSIGNED   NOT NULL,
    `source`         VARCHAR(64)    NOT NULL,
    `description`    TEXT           NULL,
    `amount`         DECIMAL(12,2)  NOT NULL,
    `payment_method` ENUM('cash','card','transfer','other') NOT NULL DEFAULT 'transfer',
    `income_date`    DATE           NOT NULL,
    `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_incomes_user_date`   (`user_id`, `income_date` DESC),
    KEY `ix_incomes_user_source` (`user_id`, `source`),
    CONSTRAINT `fk_incomes_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Spese ricorrenti ─────────────────────────────────────────────────────────
-- Migration: 005_recurring_expenses.sql
CREATE TABLE IF NOT EXISTS `recurring_expenses` (
    `id`                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`             INT UNSIGNED   NOT NULL,
    `category_id`         INT UNSIGNED   NULL,
    `amount`              DECIMAL(12,2)  NOT NULL,
    `description`         TEXT           NULL,
    `payment_method`      ENUM('cash','card','transfer','other') NOT NULL DEFAULT 'card',
    `frequency`           ENUM('weekly','monthly','yearly')      NOT NULL DEFAULT 'monthly',
    `start_date`          DATE           NOT NULL,
    `end_date`            DATE           NULL,
    `last_generated_date` DATE           NULL,
    `active`              TINYINT(1)     NOT NULL DEFAULT 1,
    `created_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_recurring_user_active` (`user_id`, `active`),
    CONSTRAINT `fk_recurring_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_recurring_category`
        FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Tag liberi per spese ─────────────────────────────────────────────────────
-- Migration: 006_tags.sql
CREATE TABLE IF NOT EXISTS `tags` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `name`       VARCHAR(48)  NOT NULL,
    `color`      VARCHAR(7)   NOT NULL DEFAULT '#6c757d',
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_tags_user_name` (`user_id`, `name`),
    CONSTRAINT `fk_tags_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `expense_tags` (
    `expense_id` INT UNSIGNED NOT NULL,
    `tag_id`     INT UNSIGNED NOT NULL,
    PRIMARY KEY (`expense_id`, `tag_id`),
    KEY `ix_expense_tags_tag` (`tag_id`),
    CONSTRAINT `fk_expense_tags_expense`
        FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_expense_tags_tag`
        FOREIGN KEY (`tag_id`)     REFERENCES `tags`     (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Allegati per spese (foto scontrini, PDF) ─────────────────────────────────
-- Migration: 007_attachments.sql
CREATE TABLE IF NOT EXISTS `expense_attachments` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `expense_id`    INT UNSIGNED NOT NULL,
    `user_id`       INT UNSIGNED NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name`   VARCHAR(96)  NOT NULL,
    `mime_type`     VARCHAR(96)  NOT NULL,
    `size_bytes`    INT UNSIGNED NOT NULL,
    `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_attachments_expense` (`expense_id`),
    KEY `ix_attachments_user`    (`user_id`),
    CONSTRAINT `fk_attachments_expense`
        FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_attachments_user`
        FOREIGN KEY (`user_id`)    REFERENCES `users`    (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Multi-conto ──────────────────────────────────────────────────────────────
-- Migration: 008_accounts.sql (+ ALTER su expenses/incomes/recurring per account_id)
-- Migration: 012_accounts_bank_details.sql (IBAN/BIC/banca/intestatario + tipo investment)
-- Migration: 015_cash_account.sql (flag is_default_cash per il conto cassa
--   "In tasca": riceve i pagamenti contanti e i prelievi bancomat in
--   partita doppia. Vincoli applicativi nel codice PHP: max 1 default per
--   user, valido solo se type='cash'.)
-- Migration: 019_account_types_and_transfers.sql (tipi `deposit` e `pac`
--   per conto deposito titoli e Piano di Accumulo Capitale; per questi
--   tipi i campi `iban`/`bank_name` ospitano IBAN e nome del broker.)
CREATE TABLE IF NOT EXISTS `accounts` (
    `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED   NOT NULL,
    `name`            VARCHAR(64)    NOT NULL,
    `type`            ENUM('checking','card','cash','savings','investment','deposit','pac','other') NOT NULL DEFAULT 'checking',
    `color`           VARCHAR(7)     NOT NULL DEFAULT '#6c757d',
    `icon`            VARCHAR(32)    NULL,
    `opening_balance` DECIMAL(12,2)  NOT NULL DEFAULT 0,
    `iban`            VARCHAR(34)    NULL,
    `bic`             VARCHAR(11)    NULL,
    `bank_name`       VARCHAR(128)   NULL,
    `account_holder`  VARCHAR(128)   NULL,
    `account_number`  VARCHAR(64)    NULL,
    `notes`           VARCHAR(255)   NULL,
    `archived`        TINYINT(1)     NOT NULL DEFAULT 0,
    `is_default_cash` TINYINT(1)     NOT NULL DEFAULT 0,
    `sort_order`      INT            NOT NULL DEFAULT 0,
    `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_accounts_user_name` (`user_id`, `name`),
    KEY `ix_accounts_user_sort` (`user_id`, `sort_order`),
    CONSTRAINT `fk_accounts_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTA: per gli ALTER TABLE che aggiungono `account_id` a expenses/incomes/recurring_expenses
--       vedere database/migrations/008_accounts.sql.

-- ── Saved filters ────────────────────────────────────────────────────────────
-- Migration: 009_saved_filters.sql
-- Splitting (Migration: 010_expense_split.sql)
-- ALTER TABLE expenses ADD COLUMN shared_with VARCHAR(255) NULL AFTER description;
-- ALTER TABLE expenses ADD COLUMN share_amount DECIMAL(12,2) NULL AFTER shared_with;
-- (gestiti via migration; non duplicati qui per evitare rebuild da zero invasivo)
--
-- Bank import (Migration: 011_bank_import.sql)
-- ALTER TABLE expenses ADD COLUMN value_date  DATE     NULL AFTER expense_date;
-- ALTER TABLE expenses ADD COLUMN import_hash CHAR(64) NULL AFTER updated_at;
-- ALTER TABLE expenses ADD UNIQUE KEY uq_expenses_user_imphash (user_id, import_hash);
-- ALTER TABLE incomes  ADD COLUMN value_date  DATE     NULL AFTER income_date;
-- ALTER TABLE incomes  ADD COLUMN import_hash CHAR(64) NULL AFTER updated_at;
-- ALTER TABLE incomes  ADD UNIQUE KEY uq_incomes_user_imphash  (user_id, import_hash);

CREATE TABLE IF NOT EXISTS `saved_filters` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `scope`      VARCHAR(32)  NOT NULL DEFAULT 'expenses',
    `name`       VARCHAR(64)  NOT NULL,
    `payload`    JSON         NOT NULL,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_saved_filters_user_scope_name` (`user_id`, `scope`, `name`),
    CONSTRAINT `fk_saved_filters_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Anagrafiche fornitori/clienti ────────────────────────────────────────────
-- Migration: 017_contacts.sql (+ ALTER su expenses/incomes/recurring per contact_id)
-- name_norm e' il nome normalizzato (lower + trim + spazi collassati) usato
-- per il matching case-insensitive in import bank statement.
CREATE TABLE IF NOT EXISTS `contacts` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `name`       VARCHAR(120) NOT NULL,
    `name_norm`  VARCHAR(120) NOT NULL,
    `type`       ENUM('supplier','customer','both') NOT NULL DEFAULT 'both',
    `vat_number` VARCHAR(32)  NULL,
    `iban`       VARCHAR(34)  NULL,
    `email`      VARCHAR(120) NULL,
    `notes`      TEXT         NULL,
    `color`      VARCHAR(7)   NOT NULL DEFAULT '#6c757d',
    `archived`   TINYINT(1)   NOT NULL DEFAULT 0,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_contacts_user_namenorm` (`user_id`, `name_norm`),
    KEY `ix_contacts_user_archived` (`user_id`, `archived`),
    CONSTRAINT `fk_contacts_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTA: per gli ALTER TABLE che aggiungono `contact_id` a expenses/incomes/recurring_expenses
--       vedere database/migrations/017_contacts.sql.

-- ── Riconciliazioni conti ────────────────────────────────────────────────────
-- Migration: 018_account_reconciliations.sql
-- L'utente dichiara il saldo reale di un conto a una data; il sistema
-- calcola la differenza rispetto a opening_balance + entrate − spese e
-- genera un movimento di rettifica (Expense o Income, categoria/source
-- "Rettifica"). Lo storico tiene traccia anche delle riconciliazioni
-- senza differenza (verifiche OK).
CREATE TABLE IF NOT EXISTS `account_reconciliations` (
    `id`                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `user_id`               INT UNSIGNED  NOT NULL,
    `account_id`            INT UNSIGNED  NOT NULL,
    `reconciled_at`         DATE          NOT NULL,
    `declared_balance`      DECIMAL(12,2) NOT NULL,
    `calculated_balance`    DECIMAL(12,2) NOT NULL,
    `difference`            DECIMAL(12,2) NOT NULL,
    `adjustment_type`       ENUM('expense','income','none') NOT NULL DEFAULT 'none',
    `adjustment_expense_id` INT UNSIGNED  NULL,
    `adjustment_income_id`  INT UNSIGNED  NULL,
    `notes`                 VARCHAR(255)  NULL,
    `created_at`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_recon_user_account` (`user_id`, `account_id`, `reconciled_at`),
    CONSTRAINT `fk_recon_user`
        FOREIGN KEY (`user_id`)    REFERENCES `users`    (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_recon_account`
        FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_recon_expense`
        FOREIGN KEY (`adjustment_expense_id`) REFERENCES `expenses` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_recon_income`
        FOREIGN KEY (`adjustment_income_id`)  REFERENCES `incomes`  (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Trasferimenti atomici fra conti ──────────────────────────────────────────
-- Migration: 019_account_types_and_transfers.sql
-- Un Transfer rappresenta un bonifico fra due conti dell'utente. In una
-- transazione DB unica vengono create:
--   • una `expenses` row sul conto sorgente con `is_transfer=1` e
--     `transfer_id` settato (uscita reale dal conto);
--   • una `incomes`  row sul conto destinazione con `is_transfer=1` e
--     `transfer_id` settato (entrata reale sul conto).
-- Saldo conto = include i transfer (sono uscite/entrate vere). KPI mensili
-- dashboard/reports filtrano `is_transfer=0` per non gonfiare i totali.
-- ON DELETE CASCADE su `transfer_id` rimuove le due scritture quando il
-- transfer viene eliminato.
CREATE TABLE IF NOT EXISTS `transfers` (
    `id`                       INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`                  INT UNSIGNED   NOT NULL,
    `source_account_id`        INT UNSIGNED   NOT NULL,
    `destination_account_id`   INT UNSIGNED   NOT NULL,
    `amount`                   DECIMAL(12,2)  NOT NULL,
    `transfer_date`            DATE           NOT NULL,
    `description`              VARCHAR(255)   NULL,
    `notes`                    VARCHAR(255)   NULL,
    `created_at`               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_transfers_user_date` (`user_id`, `transfer_date` DESC),
    KEY `ix_transfers_user_src`  (`user_id`, `source_account_id`),
    KEY `ix_transfers_user_dst`  (`user_id`, `destination_account_id`),
    CONSTRAINT `fk_transfers_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transfers_source`
        FOREIGN KEY (`source_account_id`)      REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transfers_destination`
        FOREIGN KEY (`destination_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTA: per gli ALTER TABLE che aggiungono `transfer_id` UNIQUE FK + flag
--       `is_transfer` a expenses/incomes vedere
--       database/migrations/019_account_types_and_transfers.sql.

-- ── Investimenti: asset class, strumenti, prezzi, transazioni ─────────────────
-- Migration: 020_securities.sql
-- Schema completo per il dominio investimenti su conto deposito titoli.
-- Le holdings (qty, prezzo medio carico, mark-to-market) sono derivate via
-- aggregation in HoldingsRepository, NON salvate. La cancellazione di una
-- transazione mantiene la coerenza senza logica extra.
-- Le righe `expenses` create da BUY/FEE sono flaggate `is_investment=1`
-- (vedi ALTER expenses sotto).
CREATE TABLE IF NOT EXISTS `asset_classes` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `name`       VARCHAR(48)  NOT NULL,
    `color`      VARCHAR(7)   NOT NULL DEFAULT '#6c757d',
    `icon`       VARCHAR(32)  NULL,
    `sort_order` INT          NOT NULL DEFAULT 0,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_asset_classes_user_name` (`user_id`, `name`),
    KEY `ix_asset_classes_user_sort` (`user_id`, `sort_order`),
    CONSTRAINT `fk_asset_classes_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `securities_instruments` (
    `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED   NOT NULL,
    `account_id`      INT UNSIGNED   NULL,
    `asset_class_id`  INT UNSIGNED   NULL,
    `isin`            CHAR(12)       NULL,
    `ticker`          VARCHAR(16)    NULL,
    `name`            VARCHAR(128)   NOT NULL,
    `currency`        CHAR(3)        NOT NULL DEFAULT 'EUR',
    `notes`           TEXT           NULL,
    `archived`        TINYINT(1)     NOT NULL DEFAULT 0,
    `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_securities_user_isin`   (`user_id`, `isin`),
    UNIQUE KEY `uq_securities_user_ticker` (`user_id`, `ticker`),
    KEY `ix_securities_user_account` (`user_id`, `account_id`),
    KEY `ix_securities_user_class`   (`user_id`, `asset_class_id`),
    CONSTRAINT `fk_securities_user`
        FOREIGN KEY (`user_id`)         REFERENCES `users`         (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_securities_account`
        FOREIGN KEY (`account_id`)      REFERENCES `accounts`      (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_securities_class`
        FOREIGN KEY (`asset_class_id`)  REFERENCES `asset_classes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `securities_prices` (
    `id`            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `instrument_id` INT UNSIGNED   NOT NULL,
    `price_date`    DATE           NOT NULL,
    `price`         DECIMAL(18,6)  NOT NULL,
    `source`        ENUM('manual','external') NOT NULL DEFAULT 'manual',
    `created_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_prices_instr_date` (`instrument_id`, `price_date`),
    CONSTRAINT `fk_prices_instr`
        FOREIGN KEY (`instrument_id`) REFERENCES `securities_instruments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `securities_transactions` (
    `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED   NOT NULL,
    `account_id`      INT UNSIGNED   NOT NULL,
    `instrument_id`   INT UNSIGNED   NOT NULL,
    `kind`            ENUM('BUY','SELL','DIVIDEND','FEE','SPLIT') NOT NULL,
    `trade_date`      DATE           NOT NULL,
    `settlement_date` DATE           NULL,
    `quantity`        DECIMAL(18,6)  NOT NULL DEFAULT 0,
    `price`           DECIMAL(18,6)  NOT NULL DEFAULT 0,
    `fee`             DECIMAL(12,2)  NOT NULL DEFAULT 0,
    `gross_amount`    DECIMAL(14,2)  NOT NULL DEFAULT 0,
    `net_amount`      DECIMAL(14,2)  NOT NULL DEFAULT 0,
    `tax_withheld`    DECIMAL(12,2)  NOT NULL DEFAULT 0,
    `expense_id`      INT UNSIGNED   NULL,
    `income_id`       INT UNSIGNED   NULL,
    `notes`           TEXT           NULL,
    `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_sectx_expense` (`expense_id`),
    UNIQUE KEY `uq_sectx_income`  (`income_id`),
    KEY `ix_sectx_user_account_date` (`user_id`, `account_id`, `trade_date` DESC),
    KEY `ix_sectx_instrument_date`   (`instrument_id`, `trade_date` DESC),
    KEY `ix_sectx_user_kind_date`    (`user_id`, `kind`, `trade_date` DESC),
    CONSTRAINT `fk_sectx_user`
        FOREIGN KEY (`user_id`)        REFERENCES `users`                  (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_account`
        FOREIGN KEY (`account_id`)     REFERENCES `accounts`               (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_instrument`
        FOREIGN KEY (`instrument_id`)  REFERENCES `securities_instruments` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_expense`
        FOREIGN KEY (`expense_id`)     REFERENCES `expenses`               (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_sectx_income`
        FOREIGN KEY (`income_id`)      REFERENCES `incomes`                (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTA: per ALTER expenses ADD COLUMN `is_investment` TINYINT NOT NULL DEFAULT 0
--       vedere database/migrations/020_securities.sql.
