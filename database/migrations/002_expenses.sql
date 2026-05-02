-- Migration 002 — voci di spesa
-- Importa con: mysql -u root my_expense < database/migrations/002_expenses.sql

USE `my_expense`;

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
