-- Migration 005 — Spese ricorrenti.
-- Template di spesa con frequenza; un generator inserisce le occorrenze in `expenses`
-- fino alla data odierna, partendo da `start_date` e fermandosi a `end_date` (se presente).

USE `my_expense`;

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
