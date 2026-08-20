# My Expense

Tracker di spese personali. Gira sul tuo computer, i dati restano sul tuo
computer: un solo file, `data/my-expense.sqlite`.

## Avviare

Doppio click su **`avvia.cmd`**. Si apre la finestra dell'applicazione.

Per chiuderla, chiudi la finestra nera che è comparsa insieme all'app.

## La prima volta

1. Installa [PHP 8.1 o successivo](https://windows.php.net/download) e
   assicurati che `php` risponda dal Prompt dei comandi.
2. Apri il Prompt dei comandi nella cartella del progetto e lancia
   `composer install`.
3. Copia `config/config.example.php` in `config/config.php`.
4. Doppio click su `avvia.cmd`: al primo avvio ti chiede di creare le tue
   credenziali.

## Fare il backup

Chiudi l'app e copia il file `data/my-expense.sqlite` dove preferisci. È tutto lì.

Dall'app puoi anche scaricare un archivio ZIP che contiene i dati **e** gli
allegati: icona con la nuvola, in alto a destra.

## Cosa sa fare

- Spese ed entrate, con filtri, ricerca, categorie, tag ed etichette colorate
- Allegati: foto degli scontrini e PDF
- Lettura automatica dell'importo dalla foto di uno scontrino
- Budget mensili per categoria, con avviso quando ti avvicini al tetto
- Spese ricorrenti, generate da sole
- Più conti, con saldo aggiornato e riconciliazione
- Trasferimenti tra conti
- Rubrica di fornitori e clienti
- Investimenti e piani di accumulo
- Report annuali con grafici
- Importazione da file CSV e da estratto conto Banca Sella / Patavina
- Rateizzazione di una spesa in più quote

## In caso di problemi

Gli errori vengono scritti in `logs/`. Se l'app non parte, il messaggio utile è
quasi sempre l'ultima riga di quel file.
