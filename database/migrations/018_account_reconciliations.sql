-- Migration 018: account_reconciliations
-- Storico delle riconciliazioni di un conto: l'utente dichiara il saldo
-- reale a una certa data e il sistema genera una spesa/entrata di
-- rettifica per allineare il saldo calcolato a quello dichiarato.

CREATE TABLE IF NOT EXISTS account_reconciliations (
    id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id               INT UNSIGNED  NOT NULL,
    account_id            INT UNSIGNED  NOT NULL,
    reconciled_at         DATE          NOT NULL,
    declared_balance      DECIMAL(12,2) NOT NULL,
    calculated_balance    DECIMAL(12,2) NOT NULL,
    difference            DECIMAL(12,2) NOT NULL,
    adjustment_type       ENUM('expense','income','none') NOT NULL DEFAULT 'none',
    adjustment_expense_id INT UNSIGNED  NULL,
    adjustment_income_id  INT UNSIGNED  NULL,
    notes                 VARCHAR(255)  NULL,
    created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY ix_recon_user_account (user_id, account_id, reconciled_at),
    CONSTRAINT fk_recon_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_recon_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_recon_expense FOREIGN KEY (adjustment_expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
    CONSTRAINT fk_recon_income  FOREIGN KEY (adjustment_income_id)  REFERENCES incomes(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
