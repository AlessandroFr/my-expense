-- Migration 023 -- Password reset (recovery token).
--
-- Permette di reimpostare la password se ci si dimentica quella attuale.
-- Flusso file-based pensato per app locale single-user (no SMTP):
--   1. Su /password/forgot, l'utente inserisce lo username; il backend
--      genera un token random e ne salva l'hash su `reset_token_hash`
--      con scadenza in `reset_token_expires_at` (default 15 minuti).
--   2. Il token in chiaro viene scritto su disco in
--      `logs/password-reset.txt` (file leggibile solo da chi ha accesso
--      al filesystem della macchina = il proprietario).
--   3. L'utente apre il file, copia il codice, lo incolla su
--      /password/reset insieme alla nuova password.
--   4. Al successo il token viene azzerato (uso singolo).
--
-- Le colonne sono nullable perche' la maggior parte del tempo
-- non c'e' un reset pendente.

USE `my_expense`;

ALTER TABLE `users`
    ADD COLUMN `reset_token_hash`       CHAR(64) NULL AFTER `last_login_at`,
    ADD COLUMN `reset_token_expires_at` DATETIME NULL AFTER `reset_token_hash`;
