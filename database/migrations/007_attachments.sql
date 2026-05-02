-- Migration 007 — Allegati per spese (foto scontrini, PDF).
-- I file fisici risiedono in {project_root}/uploads/expenses/{user_id}/{stored_name}.

USE `my_expense`;

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
