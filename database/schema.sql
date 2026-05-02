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
