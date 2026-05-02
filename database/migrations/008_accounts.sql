-- Migration 008 — Conti (multi-conto: corrente, carta, cash, risparmi).
-- Ogni spesa/entrata puo' essere associata a un conto. Saldo conto = opening_balance
-- + somma_entrate - somma_spese (calcolato a runtime).

USE `my_expense`;

CREATE TABLE IF NOT EXISTS `accounts` (
    `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED   NOT NULL,
    `name`            VARCHAR(64)    NOT NULL,
    `type`            ENUM('checking','card','cash','savings','other') NOT NULL DEFAULT 'checking',
    `color`           VARCHAR(7)     NOT NULL DEFAULT '#6c757d',
    `icon`            VARCHAR(32)    NULL,
    `opening_balance` DECIMAL(12,2)  NOT NULL DEFAULT 0,
    `archived`        TINYINT(1)     NOT NULL DEFAULT 0,
    `sort_order`      INT            NOT NULL DEFAULT 0,
    `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_accounts_user_name` (`user_id`, `name`),
    KEY `ix_accounts_user_sort` (`user_id`, `sort_order`),
    CONSTRAINT `fk_accounts_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `expenses`
    ADD COLUMN `account_id` INT UNSIGNED NULL AFTER `category_id`,
    ADD KEY `ix_expenses_user_account` (`user_id`, `account_id`),
    ADD CONSTRAINT `fk_expenses_account`
        FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL;

ALTER TABLE `incomes`
    ADD COLUMN `account_id` INT UNSIGNED NULL AFTER `user_id`,
    ADD KEY `ix_incomes_user_account` (`user_id`, `account_id`),
    ADD CONSTRAINT `fk_incomes_account`
        FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL;

ALTER TABLE `recurring_expenses`
    ADD COLUMN `account_id` INT UNSIGNED NULL AFTER `category_id`,
    ADD KEY `ix_recurring_user_account` (`user_id`, `account_id`),
    ADD CONSTRAINT `fk_recurring_account`
        FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL;
