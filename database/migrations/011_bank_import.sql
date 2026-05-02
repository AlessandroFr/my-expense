-- Migration 011 — Importazione estratti conto bancari.
-- value_date: data valuta (settlement) della banca, distinta da expense_date/income_date
--   che restano la data operazione (booking). NULL per inserimenti manuali.
-- import_hash: SHA-256 di (account_id|operation_date|signed_amount|first_120_chars_desc)
--   normalizzato; UNIQUE per (user, hash) per evitare doppioni in re-import.
--   Inserimenti manuali (NULL hash) non collidono perche' MySQL tratta NULL come distinto in UNIQUE.

USE `my_expense`;

ALTER TABLE `expenses`
    ADD COLUMN `value_date`  DATE     NULL AFTER `expense_date`,
    ADD COLUMN `import_hash` CHAR(64) NULL AFTER `updated_at`,
    ADD UNIQUE KEY `uq_expenses_user_imphash` (`user_id`, `import_hash`);

ALTER TABLE `incomes`
    ADD COLUMN `value_date`  DATE     NULL AFTER `income_date`,
    ADD COLUMN `import_hash` CHAR(64) NULL AFTER `updated_at`,
    ADD UNIQUE KEY `uq_incomes_user_imphash` (`user_id`, `import_hash`);
