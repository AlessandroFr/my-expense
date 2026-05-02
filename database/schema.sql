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
    `description`    VARCHAR(255)   NULL,
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
    `source`      VARCHAR(64)    NOT NULL,
    `description` VARCHAR(255)   NULL,
    `amount`      DECIMAL(12,2)  NOT NULL,
    `income_date` DATE           NOT NULL,
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
    `description`         VARCHAR(255)   NULL,
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
