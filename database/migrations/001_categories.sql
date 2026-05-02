-- Migration 001 — categorie spese
-- Importa con: mysql -u root my_expense < database/migrations/001_categories.sql

USE `my_expense`;

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
