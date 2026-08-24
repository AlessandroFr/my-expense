-- Multivaluta: una valuta per conto, e un controvalore per ogni movimento.
--
-- La valuta di un movimento e' quella del suo conto: non serve una colonna per
-- riga, e nessun estratto conto la fornisce.
--
-- Ogni movimento porta invece il proprio controvalore nella valuta principale
-- **congelato alla sua data** (`amount_base`). E' la regola contabile giusta —
-- un report del 2025 non deve cambiare perche' oggi il cambio si e' mosso — ed
-- e' anche la scelta meno invasiva: le somme restano somme di una colonna sola.

ALTER TABLE `users`    ADD COLUMN `base_currency` TEXT COLLATE NOCASE NOT NULL DEFAULT 'EUR';
ALTER TABLE `accounts` ADD COLUMN `currency`      TEXT COLLATE NOCASE NOT NULL DEFAULT 'EUR';

-- Nullable di proposito: `COALESCE(amount_base, amount)` legge il vuoto come
-- «uguale all'importo», che e' esattamente vero per un conto nella valuta
-- principale. Cosi' nessuna riga sparisce dai totali per una conversione che
-- non c'e'.
ALTER TABLE `expenses`           ADD COLUMN `amount_base`        NUMERIC;
ALTER TABLE `expenses`           ADD COLUMN `share_amount_base`  NUMERIC;
ALTER TABLE `incomes`            ADD COLUMN `amount_base`        NUMERIC;
ALTER TABLE `transfers`          ADD COLUMN `amount_base`        NUMERIC;
ALTER TABLE `recurring_expenses` ADD COLUMN `amount_base`        NUMERIC;

-- Un trasferimento fra conti di valuta diversa ha due importi veri, quello
-- addebitato e quello accreditato, e non e' detto che il loro rapporto sia il
-- cambio del giorno: la banca ci mette il suo. Vuoto = stessa valuta.
ALTER TABLE `transfers` ADD COLUMN `destination_amount` NUMERIC;

-- I cambi sono **sempre contro EUR**, che fa da perno: e' come li pubblica ogni
-- fonte, e le altre coppie si ricavano per triangolazione. `rate` = quante
-- unita' di `quote` per 1 EUR.
CREATE TABLE IF NOT EXISTS `exchange_rates` (
    `id`         INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`    INTEGER NOT NULL,
    `quote`      TEXT COLLATE NOCASE NOT NULL,
    `rate_date`  TEXT NOT NULL,
    `rate`       NUMERIC NOT NULL,
    `source`     TEXT COLLATE NOCASE NOT NULL DEFAULT 'manual' CHECK (`source` IN ('manual', 'external')),
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_rates_user_quote_date` UNIQUE (`user_id`, `quote`, `rate_date`),
    CONSTRAINT `fk_rates_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_rates_user_quote_date` ON `exchange_rates` (`user_id`, `quote`, `rate_date`);

CREATE TRIGGER IF NOT EXISTS `tr_exchange_rates_updated_at`
AFTER UPDATE ON `exchange_rates` FOR EACH ROW
BEGIN
    UPDATE `exchange_rates` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = OLD.`id`;
END;

-- Tutto quello che esiste oggi e' in euro, e la valuta principale e' l'euro:
-- il controvalore coincide con l'importo.
UPDATE `expenses`           SET `amount_base` = `amount`       WHERE `amount_base` IS NULL;
UPDATE `expenses`           SET `share_amount_base` = `share_amount` WHERE `share_amount` IS NOT NULL AND `share_amount_base` IS NULL;
UPDATE `incomes`            SET `amount_base` = `amount`       WHERE `amount_base` IS NULL;
UPDATE `transfers`          SET `amount_base` = `amount`       WHERE `amount_base` IS NULL;
UPDATE `recurring_expenses` SET `amount_base` = `amount`       WHERE `amount_base` IS NULL;
