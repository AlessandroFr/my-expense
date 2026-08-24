# My Expense

Tracker di spese personali. Gira sul tuo computer, i dati restano sul tuo
computer: un solo file di database cifrato, niente account, niente nuvola.

## Installare

Scarica l'ultimo `MyExpense-Setup-*.exe` dalla
[pagina delle versioni](https://github.com/AlessandroFr/my-expense/releases) e
aprilo. Windows dirà che non si fida — il programma non è firmato: clicca
«Ulteriori informazioni» e poi «Esegui comunque».

Le istruzioni per esteso, scritte per chi di computer non se ne intende, sono in
[INSTALLAZIONE.md](INSTALLAZIONE.md).

Non serve nient'altro: né PHP, né Node, né XAMPP. È tutto dentro il pacchetto,
e funziona anche senza connessione a Internet. Le uniche due cose che la
richiedono sono la lettura dell'importo dalla foto di uno scontrino e lo scarico
dei cambi e delle quotazioni.

## La password

Al primo avvio l'app chiede di crearne una, e con quella il database viene
conservato **cifrato**: chi copia il file dei tuoi conti non ci legge niente.

Ti mostra anche una **chiave di recupero** di ventiquattro caratteri, una volta
sola: va scritta su un foglio e messa insieme ai documenti. Senza password e
senza chiave di recupero i dati non si aprono più — non c'è nessun altro modo.

## Dove finiscono i dati

In `%APPDATA%\My Expense`, cioè fuori dalla cartella dove si installa il
programma. Vuol dire che restano al loro posto quando arriva una versione nuova,
e non spariscono se disinstalli.

Per copiartelo via: chiudi l'app e copia la cartella `data` dove preferisci.

Dall'app puoi anche scaricare un backup che contiene i dati **e** gli allegati:
Impostazioni → Backup. Esce cifrato con la tua password.

## Cosa sa fare

- Spese ed entrate, con filtri, ricerca, categorie, tag ed etichette colorate
- Allegati: foto degli scontrini e PDF
- Lettura automatica dell'importo dalla foto di uno scontrino
- Budget mensili per categoria, con avviso quando ti avvicini al tetto
- Spese ricorrenti, generate da sole
- Più conti, con saldo aggiornato e riconciliazione
- Più valute: una per conto, con i totali generali convertiti in quella
  principale al cambio del giorno di ogni movimento
- Trasferimenti tra conti
- Rubrica di fornitori e clienti
- Investimenti e piani di accumulo
- Report annuali con grafici
- Importazione da file CSV e da estratto conto bancario, con un profilo di tracciato per banca
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

Per pubblicare una versione: alza `version` in `package.json`, poi
`npm run dist -- --publish always` con un `GH_TOKEN` nell'ambiente. Da lì l'app
se ne accorge da sola al primo avvio successivo, la scarica e si aggiorna.
