-- Migration 010 — Spese condivise.
-- Aggiunge: shared_with (lista informale di chi divide la spesa) e share_amount
-- (la quota effettivamente a tuo carico). Se share_amount IS NULL la spesa e' intera.
-- amount resta il totale dello scontrino.

USE `my_expense`;

ALTER TABLE `expenses`
    ADD COLUMN `shared_with`  VARCHAR(255)  NULL AFTER `description`,
    ADD COLUMN `share_amount` DECIMAL(12,2) NULL AFTER `shared_with`;
