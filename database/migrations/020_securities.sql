-- Migration 020 -- Strumenti finanziari, holdings, transazioni titoli.
--
-- Modello: ogni conto di tipo `deposit` puo' detenere strumenti finanziari
-- (azioni, ETF, obbligazioni). Tassonomia user-scoped via `asset_classes`.
-- Le quotazioni sono salvate manualmente in `securities_prices` (provider
-- esterno previsto come hook futuro: vedi App\Services\QuoteFetcher).
-- Ogni operazione (BUY/SELL/DIVIDEND/FEE/SPLIT) finisce in
-- `securities_transactions` ed e' linkata 1:1 a una `expenses` o `incomes`
-- row sul conto deposito tramite `expense_id` / `income_id`.
--
-- Le holdings (qty corrente, prezzo medio carico, mark-to-market) sono
-- derivate via aggregation, NON memorizzate, cosi' che cancellazioni e
-- rettifiche siano coerenti senza logica extra.

USE `my_expense`;

CREATE TABLE IF NOT EXISTS `asset_classes` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `name`       VARCHAR(48)  NOT NULL,
    `color`      VARCHAR(7)   NOT NULL DEFAULT '#6c757d',
    `icon`       VARCHAR(32)  NULL,
    `sort_order` INT          NOT NULL DEFAULT 0,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_asset_classes_user_name` (`user_id`, `name`),
    KEY `ix_asset_classes_user_sort` (`user_id`, `sort_order`),
    CONSTRAINT `fk_asset_classes_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `securities_instruments` (
    `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED   NOT NULL,
    `account_id`      INT UNSIGNED   NULL,
    `asset_class_id`  INT UNSIGNED   NULL,
    `isin`            CHAR(12)       NULL,
    `ticker`          VARCHAR(16)    NULL,
    `name`            VARCHAR(128)   NOT NULL,
    `currency`        CHAR(3)        NOT NULL DEFAULT 'EUR',
    `notes`           TEXT           NULL,
    `archived`        TINYINT(1)     NOT NULL DEFAULT 0,
    `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_securities_user_isin`   (`user_id`, `isin`),
    UNIQUE KEY `uq_securities_user_ticker` (`user_id`, `ticker`),
    KEY `ix_securities_user_account`   (`user_id`, `account_id`),
    KEY `ix_securities_user_class`     (`user_id`, `asset_class_id`),
    CONSTRAINT `fk_securities_user`
        FOREIGN KEY (`user_id`)         REFERENCES `users`         (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_securities_account`
        FOREIGN KEY (`account_id`)      REFERENCES `accounts`      (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_securities_class`
        FOREIGN KEY (`asset_class_id`)  REFERENCES `asset_classes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `securities_prices` (
    `id`            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `instrument_id` INT UNSIGNED   NOT NULL,
    `price_date`    DATE           NOT NULL,
    `price`         DECIMAL(18,6)  NOT NULL,
    `source`        ENUM('manual','external') NOT NULL DEFAULT 'manual',
    `created_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_prices_instr_date` (`instrument_id`, `price_date`),
    CONSTRAINT `fk_prices_instr`
        FOREIGN KEY (`instrument_id`) REFERENCES `securities_instruments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `securities_transactions` (
    `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`         INT UNSIGNED   NOT NULL,
    `account_id`      INT UNSIGNED   NOT NULL,
    `instrument_id`   INT UNSIGNED   NOT NULL,
    `kind`            ENUM('BUY','SELL','DIVIDEND','FEE','SPLIT') NOT NULL,
    `trade_date`      DATE           NOT NULL,
    `settlement_date` DATE           NULL,
    `quantity`        DECIMAL(18,6)  NOT NULL DEFAULT 0,
    `price`           DECIMAL(18,6)  NOT NULL DEFAULT 0,
    `fee`             DECIMAL(12,2)  NOT NULL DEFAULT 0,
    `gross_amount`    DECIMAL(14,2)  NOT NULL DEFAULT 0,
    `net_amount`      DECIMAL(14,2)  NOT NULL DEFAULT 0,
    `tax_withheld`    DECIMAL(12,2)  NOT NULL DEFAULT 0,
    `expense_id`      INT UNSIGNED   NULL,
    `income_id`       INT UNSIGNED   NULL,
    `notes`           TEXT           NULL,
    `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_sectx_expense` (`expense_id`),
    UNIQUE KEY `uq_sectx_income`  (`income_id`),
    KEY `ix_sectx_user_account_date` (`user_id`, `account_id`, `trade_date` DESC),
    KEY `ix_sectx_instrument_date`   (`instrument_id`, `trade_date` DESC),
    KEY `ix_sectx_user_kind_date`    (`user_id`, `kind`, `trade_date` DESC),
    CONSTRAINT `fk_sectx_user`
        FOREIGN KEY (`user_id`)        REFERENCES `users`                  (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_account`
        FOREIGN KEY (`account_id`)     REFERENCES `accounts`               (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_instrument`
        FOREIGN KEY (`instrument_id`)  REFERENCES `securities_instruments` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sectx_expense`
        FOREIGN KEY (`expense_id`)     REFERENCES `expenses`               (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_sectx_income`
        FOREIGN KEY (`income_id`)      REFERENCES `incomes`                (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Le righe `expenses` create da una BUY/FEE titoli vengono flaggate
-- `is_investment=1` per consentire viste segregate "spese reali vs
-- investimenti" in futuro. Non incidono sui KPI di default (l'esborso
-- conta comunque), ma sono escludibili nei report ad-hoc.
ALTER TABLE `expenses`
    ADD COLUMN `is_investment` TINYINT(1) NOT NULL DEFAULT 0;
