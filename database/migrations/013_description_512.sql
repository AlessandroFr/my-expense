-- 013_description_512.sql
-- Allarga il campo `description` da VARCHAR(255) a VARCHAR(512) sulle tabelle
-- che lo usano per testo libero. Motivazione: gli estratti conto bancari
-- (Banca Sella / Patavina) producono descrizioni con MCC + sigle + indirizzo
-- che superano regolarmente i 255 caratteri, facendo fallire l'import.

ALTER TABLE `expenses`           MODIFY COLUMN `description` VARCHAR(512) NULL;
ALTER TABLE `incomes`            MODIFY COLUMN `description` VARCHAR(512) NULL;
ALTER TABLE `recurring_expenses` MODIFY COLUMN `description` VARCHAR(512) NULL;
