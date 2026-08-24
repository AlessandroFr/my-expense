-- Quando un controvalore smette di essere vero.
--
-- `amount_base` e' un dato derivato: importo, valuta del conto e data del
-- movimento. Se una di quelle tre cambia, il numero scritto prima non descrive
-- piu' niente — e sarebbe quello che finisce nei totali.
--
-- Questi trigger non calcolano niente: dicono soltanto «questo e' scaduto»,
-- mettendolo a NULL. A ricalcolarlo e' `server/fx.js`, che sa dove stanno i
-- cambi e cosa fare quando mancano. La divisione e' voluta: SQL sa **quando**
-- un valore e' scaduto, JavaScript sa **quanto** vale. Scrivere la conversione
-- anche qui vorrebbe dire due regole del denaro da tenere d'accordo per sempre.
--
-- Un `UPDATE OF` si accorge anche di una modifica fatta da una route che non
-- esisteva quando questo file e' stato scritto: e' il motivo per cui sta qui e
-- non in una funzione che qualcuno deve ricordarsi di chiamare.

CREATE TRIGGER IF NOT EXISTS `tr_expenses_base_scaduto`
AFTER UPDATE OF `amount`, `share_amount`, `account_id`, `expense_date` ON `expenses`
FOR EACH ROW WHEN NEW.`amount_base` IS NOT NULL OR NEW.`share_amount_base` IS NOT NULL
BEGIN
    UPDATE `expenses` SET `amount_base` = NULL, `share_amount_base` = NULL WHERE `id` = NEW.`id`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_incomes_base_scaduto`
AFTER UPDATE OF `amount`, `account_id`, `income_date` ON `incomes`
FOR EACH ROW WHEN NEW.`amount_base` IS NOT NULL
BEGIN
    UPDATE `incomes` SET `amount_base` = NULL WHERE `id` = NEW.`id`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_transfers_base_scaduto`
AFTER UPDATE OF `amount`, `source_account_id`, `transfer_date` ON `transfers`
FOR EACH ROW WHEN NEW.`amount_base` IS NOT NULL
BEGIN
    UPDATE `transfers` SET `amount_base` = NULL WHERE `id` = NEW.`id`;
END;

CREATE TRIGGER IF NOT EXISTS `tr_recurring_base_scaduto`
AFTER UPDATE OF `amount`, `account_id` ON `recurring_expenses`
FOR EACH ROW WHEN NEW.`amount_base` IS NOT NULL
BEGIN
    UPDATE `recurring_expenses` SET `amount_base` = NULL WHERE `id` = NEW.`id`;
END;

-- Cambiare la valuta di un conto rifa' il conto a tutti i suoi movimenti.
CREATE TRIGGER IF NOT EXISTS `tr_accounts_valuta_cambiata`
AFTER UPDATE OF `currency` ON `accounts`
FOR EACH ROW WHEN NEW.`currency` <> OLD.`currency`
BEGIN
    UPDATE `expenses`           SET `amount_base` = NULL, `share_amount_base` = NULL WHERE `account_id` = NEW.`id`;
    UPDATE `incomes`            SET `amount_base` = NULL WHERE `account_id` = NEW.`id`;
    UPDATE `transfers`          SET `amount_base` = NULL WHERE `source_account_id` = NEW.`id`;
    UPDATE `recurring_expenses` SET `amount_base` = NULL WHERE `account_id` = NEW.`id`;
END;

-- E cambiare la valuta principale li rifa' tutti, senza eccezioni.
CREATE TRIGGER IF NOT EXISTS `tr_users_valuta_principale_cambiata`
AFTER UPDATE OF `base_currency` ON `users`
FOR EACH ROW WHEN NEW.`base_currency` <> OLD.`base_currency`
BEGIN
    UPDATE `expenses`           SET `amount_base` = NULL, `share_amount_base` = NULL WHERE `user_id` = NEW.`id`;
    UPDATE `incomes`            SET `amount_base` = NULL WHERE `user_id` = NEW.`id`;
    UPDATE `transfers`          SET `amount_base` = NULL WHERE `user_id` = NEW.`id`;
    UPDATE `recurring_expenses` SET `amount_base` = NULL WHERE `user_id` = NEW.`id`;
END;
