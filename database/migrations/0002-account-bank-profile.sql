-- Il profilo di tracciato del conto: l'import dell'estratto conto sa gia' come
-- si legge il file di quella banca, invece di indovinarlo ogni volta.
-- NULL = nessun profilo assegnato, si torna al riconoscimento automatico.

ALTER TABLE `accounts` ADD COLUMN `bank_profile_id` INTEGER REFERENCES `bank_profiles` (`id`) ON DELETE SET NULL;
