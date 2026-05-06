-- 014_income_payment_method.sql
-- Aggiunge `payment_method` su incomes per simmetria con expenses. Motivazione:
-- l'import da estratto conto bancario produce sia spese che entrate, e l'utente
-- vuole poter selezionare il tipo di pagamento (carta / bonifico / contanti)
-- anche sulle entrate dove il parser non riesce ad auto-classificare. Default
-- 'transfer' perche' la maggior parte delle entrate via bank statement sono
-- bonifici / accrediti.

ALTER TABLE `incomes`
    ADD COLUMN `payment_method`
        ENUM('cash','card','transfer','other') NOT NULL DEFAULT 'transfer'
        AFTER `amount`;
