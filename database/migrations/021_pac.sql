-- Migration 021 -- Piano di Accumulo Capitale (PAC).
--
-- Modello: ogni `pac_plan` versa periodicamente un importo fisso da un conto
-- (tipicamente checking) verso un conto `pac` (con FK a un `pac_fund`).
-- La generazione delle contribuzioni e' idempotente:
--   - PacService::generatePending(userId) clone del pattern RecurringExpense
--   - bank import scansiona estratto conto e crea le contribuzioni mancanti
-- entrambi rispettano UNIQUE(plan_id, contribution_date).
--
-- Ogni contribuzione genera in transazione un Transfer atomico
-- (CC -> conto PAC) che propaga uscita+entrata. La FK transfer_id permette
-- di risalire e di eliminare in cascata.

USE `my_expense`;

CREATE TABLE IF NOT EXISTS `pac_funds` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED NOT NULL,
    `asset_class_id`  INT UNSIGNED NULL,
    `name`            VARCHAR(128) NOT NULL,
    `isin`            CHAR(12)     NULL,
    `fund_type`       ENUM('etf','mutual','index','other') NOT NULL DEFAULT 'etf',
    `currency`        CHAR(3)      NOT NULL DEFAULT 'EUR',
    `notes`           TEXT         NULL,
    `archived`        TINYINT(1)   NOT NULL DEFAULT 0,
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_pac_funds_user_name` (`user_id`, `name`),
    UNIQUE KEY `uq_pac_funds_user_isin` (`user_id`, `isin`),
    KEY `ix_pac_funds_user_class` (`user_id`, `asset_class_id`),
    CONSTRAINT `fk_pac_funds_user`
        FOREIGN KEY (`user_id`)        REFERENCES `users`         (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_funds_class`
        FOREIGN KEY (`asset_class_id`) REFERENCES `asset_classes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pac_fund_navs` (
    `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `fund_id`    INT UNSIGNED  NOT NULL,
    `nav_date`   DATE          NOT NULL,
    `nav`        DECIMAL(18,6) NOT NULL,
    `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_pac_navs_fund_date` (`fund_id`, `nav_date`),
    CONSTRAINT `fk_pac_navs_fund`
        FOREIGN KEY (`fund_id`) REFERENCES `pac_funds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pac_plans` (
    `id`                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`             INT UNSIGNED   NOT NULL,
    `account_id`          INT UNSIGNED   NOT NULL,
    `source_account_id`   INT UNSIGNED   NULL,
    `fund_id`             INT UNSIGNED   NOT NULL,
    `name`                VARCHAR(96)    NOT NULL,
    `frequency`           ENUM('weekly','monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
    `amount`              DECIMAL(12,2)  NOT NULL,
    `start_date`          DATE           NOT NULL,
    `end_date`            DATE           NULL,
    `last_generated_date` DATE           NULL,
    `beneficiary_iban`    CHAR(34)       NULL,
    `beneficiary_keyword` VARCHAR(64)    NULL,
    `active`              TINYINT(1)     NOT NULL DEFAULT 1,
    `notes`               VARCHAR(255)   NULL,
    `created_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_pac_plans_user_active`  (`user_id`, `active`),
    KEY `ix_pac_plans_user_account` (`user_id`, `account_id`),
    KEY `ix_pac_plans_user_fund`    (`user_id`, `fund_id`),
    KEY `ix_pac_plans_keyword`      (`user_id`, `beneficiary_keyword`),
    CONSTRAINT `fk_pac_plans_user`
        FOREIGN KEY (`user_id`)            REFERENCES `users`     (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_plans_account`
        FOREIGN KEY (`account_id`)         REFERENCES `accounts`  (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_plans_source`
        FOREIGN KEY (`source_account_id`)  REFERENCES `accounts`  (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_pac_plans_fund`
        FOREIGN KEY (`fund_id`)            REFERENCES `pac_funds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pac_contributions` (
    `id`                INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`           INT UNSIGNED   NOT NULL,
    `plan_id`           INT UNSIGNED   NOT NULL,
    `contribution_date` DATE           NOT NULL,
    `amount`            DECIMAL(12,2)  NOT NULL,
    `nav`               DECIMAL(18,6)  NULL,
    `units`             DECIMAL(18,6)  NULL,
    `transfer_id`       INT UNSIGNED   NULL,
    `source`            ENUM('auto','manual','import') NOT NULL DEFAULT 'manual',
    `notes`             VARCHAR(255)   NULL,
    `created_at`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_pac_contrib_plan_date` (`plan_id`, `contribution_date`),
    KEY `ix_pac_contrib_user_date` (`user_id`, `contribution_date` DESC),
    KEY `ix_pac_contrib_transfer`  (`transfer_id`),
    CONSTRAINT `fk_pac_contrib_user`
        FOREIGN KEY (`user_id`)     REFERENCES `users`     (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_contrib_plan`
        FOREIGN KEY (`plan_id`)     REFERENCES `pac_plans` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pac_contrib_transfer`
        FOREIGN KEY (`transfer_id`) REFERENCES `transfers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
