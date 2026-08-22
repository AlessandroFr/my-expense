-- Il versamento sa da quale spesa arriva.
--
-- Serve a distinguere i versamenti nati da un movimento vero dell'estratto
-- conto da quelli che si erano creati da soli dal piano: i primi non si
-- possono cancellare portandosi via la spesa, che e' successa davvero.
ALTER TABLE `pac_contributions` ADD COLUMN `expense_id` INTEGER REFERENCES `expenses` (`id`) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS `ix_pac_contrib_expense` ON `pac_contributions` (`expense_id`);
