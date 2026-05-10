-- Migration 022 -- Rateizzazione spese.
--
-- Permette di spezzare una spesa in N rate (mensili / settimanali /
-- personalizzate). Le rate vengono materializzate immediatamente come N
-- righe `expenses` collegate da `parent_expense_id` self-FK + numerate
-- da `installment_seq`/`installment_total`.
--
-- Modello:
--   - Rata #1 (la "testata"): parent_expense_id = NULL, installment_seq = 1,
--     installment_total = N. Eredita l'eventuale import_hash quando la rata
--     proviene da un import bancario.
--   - Rate #2..N: parent_expense_id = id(rata #1), installment_seq = 2..N,
--     installment_total = N. import_hash = NULL (sono pianificate, non
--     corrispondono a righe di estratto conto).
--
-- ON DELETE SET NULL e' deliberato: cancellando la rata #1 le altre rate
-- restano leggibili come spese normali (importi reali pagati). CASCADE
-- distruggerebbe lo storico. Il listing mostra ancora il badge
-- "Rata X di N" via i campi installment_seq/total invariati.

USE `my_expense`;

ALTER TABLE `expenses`
    ADD COLUMN `parent_expense_id` INT UNSIGNED NULL AFTER `import_hash`,
    ADD COLUMN `installment_seq`   INT UNSIGNED NULL AFTER `parent_expense_id`,
    ADD COLUMN `installment_total` INT UNSIGNED NULL AFTER `installment_seq`,
    ADD KEY `ix_expenses_parent` (`parent_expense_id`),
    ADD CONSTRAINT `fk_expenses_parent`
        FOREIGN KEY (`parent_expense_id`) REFERENCES `expenses` (`id`) ON DELETE SET NULL;
