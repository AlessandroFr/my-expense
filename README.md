# My Expense

Tracker di spese personali. Gira sul tuo computer, i dati restano sul tuo
computer: un solo file di database, niente account, niente nuvola.

## Installare

Apri `MyExpense-Setup-1.0.0.exe` e segui l'installazione. Poi doppio click
sull'icona, sul desktop o nel menu avvio.

Non serve nient'altro: né PHP, né Node, né XAMPP. È tutto dentro il pacchetto,
e funziona anche senza connessione a Internet. L'unica cosa che la richiede è
la lettura automatica dell'importo dalla foto di uno scontrino.

## Dove finiscono i dati

In `%APPDATA%\My Expense`, cioè fuori dalla cartella dove si installa il
programma. Vuol dire che restano al loro posto quando arriva una versione nuova,
e non spariscono se disinstalli.

Per copiartelo via: chiudi l'app e copia la cartella `data` dove preferisci.

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

## Lavorare al codice

Serve [Node 22 o successivo](https://nodejs.org), poi:

```sh
npm install
npm run app     # la finestra dell'app, come per chi la installa
npm start       # solo il server, da aprire nel browser su 127.0.0.1:8080
npm test
npm run dist    # crea l'installer in dist\
```

Con `npm run app` e `npm start` i dati stanno nella cartella del progetto,
non in `%APPDATA%`, così le prove non toccano i dati veri.
