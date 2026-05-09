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
CREATE TABLE IF NOT EXISTS `accounts` (
    `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED   NOT NULL,
    `name`            VARCHAR(64)    NOT NULL,
    `type`            ENUM('checking','card','cash','savings','investment','other') NOT NULL DEFAULT 'checking',
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
