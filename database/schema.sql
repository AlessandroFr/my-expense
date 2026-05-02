-- ─── my-expense — schema bootstrap ────────────────────────────────────────────
-- Importa con: mysql -u root my_expense < database/schema.sql
-- Oppure da phpMyAdmin: Crea il DB `my_expense`, poi Import → seleziona questo file.
--
-- Solo la tabella `users` per ora. Categorie/spese arrivano nelle iterazioni successive.

CREATE DATABASE IF NOT EXISTS `my_expense`
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE `my_expense`;

-- ── Utenti (singolo utente per ora; schema pronto per multi se in futuro) ────
CREATE TABLE IF NOT EXISTS `users` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username`       VARCHAR(64)  NOT NULL,
    `password_hash`  VARCHAR(255) NOT NULL,
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `last_login_at`  DATETIME     NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
