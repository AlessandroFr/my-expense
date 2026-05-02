-- Migration 009 — Saved filters per /expenses (e in futuro altre liste).
-- payload: JSON serializzato dei filtri (es. {"date_from":"2026-01-01","tag":"lavoro"}).

USE `my_expense`;

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
