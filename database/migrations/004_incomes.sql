-- Migration 004 — Entrate (income).
-- Speculare a `expenses`. Ha un campo `source` libero (vs categoria FK).

USE `my_expense`;

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
