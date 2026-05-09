-- Migration 019 — Conto deposito titoli + Conto PAC + Trasferimenti atomici.
--
-- 1) Estende l'ENUM `accounts.type` con `deposit` (deposito titoli) e `pac`
--    (Piano di Accumulo Capitale). Per questi tipi i campi `iban` e `bank_name`
--    di migration 012 vengono riusati per memorizzare IBAN e nome del broker.
--
-- 2) Crea la tabella `transfers` per modellare i bonifici fra conti come
--    operazioni atomiche: ogni Transfer genera in un'unica transazione una
--    `expenses` row sul conto sorgente e una `incomes` row sul conto
--    destinazione, entrambe flaggate `is_transfer=1` e legate al transfer.
--    I KPI mensili dashboard/reports filtrano `is_transfer=0` per non
--    contare due volte; il saldo conto INVECE conta i transfer (uscita reale
--    da un conto, entrata reale sull'altro).
--
-- 3) Aggiunge le colonne `transfer_id` (FK + UNIQUE) e `is_transfer` su
--    `expenses` e `incomes`. Cancellando un Transfer le due scritture
--    spariscono in cascata.

USE `my_expense`;

ALTER TABLE `accounts`
    MODIFY COLUMN `type`
        ENUM('checking','card','cash','savings','investment','deposit','pac','other')
        NOT NULL DEFAULT 'checking';

CREATE TABLE IF NOT EXISTS `transfers` (
    `id`                       INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    `user_id`                  INT UNSIGNED   NOT NULL,
    `source_account_id`        INT UNSIGNED   NOT NULL,
    `destination_account_id`   INT UNSIGNED   NOT NULL,
    `amount`                   DECIMAL(12,2)  NOT NULL,
    `transfer_date`            DATE           NOT NULL,
    `description`              VARCHAR(255)   NULL,
    `notes`                    VARCHAR(255)   NULL,
    `created_at`               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `ix_transfers_user_date` (`user_id`, `transfer_date` DESC),
    KEY `ix_transfers_user_src`  (`user_id`, `source_account_id`),
    KEY `ix_transfers_user_dst`  (`user_id`, `destination_account_id`),
    CONSTRAINT `fk_transfers_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transfers_source`
        FOREIGN KEY (`source_account_id`)      REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transfers_destination`
        FOREIGN KEY (`destination_account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `expenses`
    ADD COLUMN `transfer_id`  INT UNSIGNED NULL,
    ADD COLUMN `is_transfer`  TINYINT(1)   NOT NULL DEFAULT 0,
    ADD UNIQUE KEY `uq_expenses_transfer` (`transfer_id`),
    ADD CONSTRAINT `fk_expenses_transfer`
        FOREIGN KEY (`transfer_id`) REFERENCES `transfers` (`id`) ON DELETE CASCADE;

ALTER TABLE `incomes`
    ADD COLUMN `transfer_id`  INT UNSIGNED NULL,
    ADD COLUMN `is_transfer`  TINYINT(1)   NOT NULL DEFAULT 0,
    ADD UNIQUE KEY `uq_incomes_transfer` (`transfer_id`),
    ADD CONSTRAINT `fk_incomes_transfer`
        FOREIGN KEY (`transfer_id`) REFERENCES `transfers` (`id`) ON DELETE CASCADE;
