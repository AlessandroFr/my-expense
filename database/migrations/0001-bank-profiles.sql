-- Profili di tracciato degli estratti conto: uno per banca.
-- Le righe preimpostate non stanno qui: le crea il codice
-- (routes/bank-profiles.js::ensureBuiltins), perche' su database nuovo le
-- migration vengono solo registrate e mai eseguite.

CREATE TABLE IF NOT EXISTS `bank_profiles` (
    `id`                     INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id`                INTEGER NOT NULL,
    `name`                   TEXT COLLATE NOCASE NOT NULL,
    `builtin_key`            TEXT COLLATE NOCASE,
    `delimiter`              TEXT NOT NULL DEFAULT 'auto',
    `encoding`               TEXT NOT NULL DEFAULT 'auto',
    `amount_mode`            TEXT NOT NULL DEFAULT 'auto',
    `date_order`             TEXT NOT NULL DEFAULT 'auto',
    `columns_json`           TEXT NOT NULL DEFAULT '{}',
    `notes`                  TEXT COLLATE NOCASE,
    `sort_order`             INTEGER NOT NULL DEFAULT 0,
    `created_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_bank_profiles_user_name` UNIQUE (`user_id`, `name`),
    CONSTRAINT `uq_bank_profiles_user_builtin` UNIQUE (`user_id`, `builtin_key`),
    CONSTRAINT `fk_bank_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `ix_bank_profiles_user_sort` ON `bank_profiles` (`user_id`, `sort_order`);
