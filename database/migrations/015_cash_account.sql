-- Migration 015 — Conto cassa "In tasca" + flag default cash.
-- Introduce un conto di tipo 'cash' designato per raccogliere i pagamenti
-- in contanti e i prelievi bancomat (partita doppia in import bancario).
-- Vincoli "max 1 default cash per utente" e "is_default_cash=1 implica
-- type='cash'" sono applicativi (vedi App\Account::create/update).
--
-- Backfill: se l'utente ha gia' righe expenses/incomes con
-- payment_method='cash' AND account_id IS NULL e nessun conto 'cash',
-- crea "In tasca" e ri-assegna le righe orfane per coerenza dei saldi.

USE `my_expense`;

-- 1. Colonna flag default cash
ALTER TABLE `accounts`
    ADD COLUMN `is_default_cash` TINYINT(1) NOT NULL DEFAULT 0 AFTER `archived`;

-- 2. Per ogni utente con righe cash orfane e nessun conto cash, crea "In tasca"
INSERT INTO `accounts`
    (`user_id`, `name`, `type`, `color`, `icon`, `opening_balance`, `sort_order`, `is_default_cash`)
SELECT DISTINCT u.`id`, 'In tasca', 'cash', '#20c997', 'wallet2', '0.00', 50, 1
FROM `users` u
WHERE EXISTS (
        SELECT 1 FROM `expenses` e
         WHERE e.`user_id` = u.`id`
           AND e.`payment_method` = 'cash'
           AND e.`account_id` IS NULL
        UNION
        SELECT 1 FROM `incomes` i
         WHERE i.`user_id` = u.`id`
           AND i.`payment_method` = 'cash'
           AND i.`account_id` IS NULL
      )
  AND NOT EXISTS (
        SELECT 1 FROM `accounts` a2
         WHERE a2.`user_id` = u.`id`
           AND a2.`type` = 'cash'
      );

-- 3. Per gli utenti che hanno gia' almeno un conto cash ma nessun default,
--    promuovi il conto cash con id minimo a default
UPDATE `accounts` a
JOIN (
    SELECT `user_id`, MIN(`id`) AS first_id
    FROM `accounts`
    WHERE `type` = 'cash'
    GROUP BY `user_id`
) first ON first.`user_id` = a.`user_id` AND first.first_id = a.`id`
LEFT JOIN `accounts` d
    ON d.`user_id` = a.`user_id` AND d.`is_default_cash` = 1
SET a.`is_default_cash` = 1
WHERE d.`id` IS NULL;

-- 4. Riassegna le righe cash orfane al default cash dell'utente
UPDATE `expenses` e
JOIN `accounts` a ON a.`user_id` = e.`user_id` AND a.`is_default_cash` = 1
SET e.`account_id` = a.`id`
WHERE e.`payment_method` = 'cash' AND e.`account_id` IS NULL;

UPDATE `incomes` i
JOIN `accounts` a ON a.`user_id` = i.`user_id` AND a.`is_default_cash` = 1
SET i.`account_id` = a.`id`
WHERE i.`payment_method` = 'cash' AND i.`account_id` IS NULL;
