-- Migration 012 — Dettagli bancari sui conti + tipo "investment".
-- Aggiunge IBAN, BIC/SWIFT, banca, intestatario, numero conto e note libere.
-- Espande l'ENUM `type` con `investment` (Risparmi `savings` esisteva gia').
-- Tutti i nuovi campi sono nullable: cash/contanti senza dati bancari restano validi.

USE `my_expense`;

ALTER TABLE `accounts`
    MODIFY COLUMN `type`
        ENUM('checking','card','cash','savings','investment','other')
        NOT NULL DEFAULT 'checking',
    ADD COLUMN `iban`            VARCHAR(34)  NULL AFTER `opening_balance`,
    ADD COLUMN `bic`             VARCHAR(11)  NULL AFTER `iban`,
    ADD COLUMN `bank_name`       VARCHAR(128) NULL AFTER `bic`,
    ADD COLUMN `account_holder`  VARCHAR(128) NULL AFTER `bank_name`,
    ADD COLUMN `account_number`  VARCHAR(64)  NULL AFTER `account_holder`,
    ADD COLUMN `notes`           VARCHAR(255) NULL AFTER `account_number`;
