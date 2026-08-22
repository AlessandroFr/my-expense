-- Il simbolo di borsa del fondo (es. SWDA.MI): con quello si scaricano le
-- quotazioni senza dover ricercare l'ISIN ogni volta, e si puo' correggere a
-- mano quando la ricerca sceglie la borsa sbagliata.

ALTER TABLE `pac_funds` ADD COLUMN `symbol` TEXT COLLATE NOCASE;
