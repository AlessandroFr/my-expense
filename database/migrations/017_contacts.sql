-- Migration 017 — Anagrafiche fornitori/clienti (contacts).
-- Tabella unica: type ∈ {supplier, customer, both}. name_norm e' il nome
-- normalizzato (lower + trim + spazi collassati) usato per il matching
-- case-insensitive durante l'import dell'estratto conto.
-- expenses/incomes/recurring_expenses guadagnano `contact_id` (nullable, FK SET NULL).

USE `my_expense`;

CREATE TABLE IF NOT EXISTS `contacts` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `name`       VARCHAR(120) NOT NULL,
    `name_norm`  VARCHAR(120) NOT NULL,
    `type`       ENUM('supplier','customer','both') NOT NULL DEFAULT 'both',
    `vat_number` VARCHAR(32)  NULL,
    `iban`       VARCHAR(34)  NULL,
    `email`      VARCHAR(120) NULL,
    `notes`      TEXT         NULL,
    `color`      VARCHAR(7)   NOT NULL DEFAULT '#6c757d',
    `archived`   TINYINT(1)   NOT NULL DEFAULT 0,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_contacts_user_namenorm` (`user_id`, `name_norm`),
    KEY `ix_contacts_user_archived` (`user_id`, `archived`),
    CONSTRAINT `fk_contacts_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `expenses`
    ADD COLUMN `contact_id` INT UNSIGNED NULL AFTER `category_id`,
    ADD KEY `ix_expenses_user_contact` (`user_id`, `contact_id`),
    ADD CONSTRAINT `fk_expenses_contact`
        FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL;

ALTER TABLE `incomes`
    ADD COLUMN `contact_id` INT UNSIGNED NULL AFTER `user_id`,
    ADD KEY `ix_incomes_user_contact` (`user_id`, `contact_id`),
    ADD CONSTRAINT `fk_incomes_contact`
        FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL;

ALTER TABLE `recurring_expenses`
    ADD COLUMN `contact_id` INT UNSIGNED NULL AFTER `category_id`,
    ADD KEY `ix_recurring_user_contact` (`user_id`, `contact_id`),
    ADD CONSTRAINT `fk_recurring_contact`
        FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL;
