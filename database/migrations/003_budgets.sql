-- Migration 003 — Budget mensili per categoria.
-- Ogni budget = (utente, categoria, mese YYYY-MM, importo). Unique per evitare duplicati.

USE `my_expense`;

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
