-- 016_description_text.sql
-- Promuove `description` da VARCHAR(512) a TEXT sulle tabelle che lo usano
-- come testo libero. Motivazione: l'editor TinyMCE introdotto nei modal di
-- /expenses e /incomes salva HTML formattato (paragrafi, liste, link) con
-- overhead di tag che eccede facilmente i 512 byte anche per testi brevi.

ALTER TABLE `expenses`           MODIFY COLUMN `description` TEXT NULL;
ALTER TABLE `incomes`            MODIFY COLUMN `description` TEXT NULL;
ALTER TABLE `recurring_expenses` MODIFY COLUMN `description` TEXT NULL;
