# Installare My Expense

Serve un computer Windows. Non serve altro: né un programma da installare
prima, né un account, né una connessione a Internet per usarla.

## 1. Scarica il programma

Vai alla pagina delle versioni:

**https://github.com/AlessandroFr/my-expense/releases**

Scarica il file che si chiama `MyExpense-Setup-` seguito da un numero, per
esempio `MyExpense-Setup-2.0.0.exe`. Prendi sempre quello più in alto: è
l'ultimo.

## 2. Windows dirà che non si fida. Va bene lo stesso

Quando apri il file, Windows mostra una finestra blu:

> **Windows ha protetto il PC**
> Microsoft Defender SmartScreen ha impedito l'avvio di un'app non riconosciuta.

Non vuol dire che il programma sia pericoloso. Vuol dire che non è stato
firmato con un certificato — un documento che costa qualche centinaio di euro
l'anno, e per un programma regalato a degli amici non ha senso comprarlo.

Per continuare:

1. clicca **Ulteriori informazioni** (il testo piccolo sotto il messaggio);
2. clicca **Esegui comunque**, che compare solo dopo il primo clic.

## 3. Installa

Vai avanti fino alla fine. Puoi scegliere la cartella, ma va benissimo quella
che propone. Alla fine trovi «My Expense» nel menu Start e sul desktop.

## 4. Il primo avvio

L'app ti chiede tre cose, una alla volta.

**Una password.** Serve ad aprire l'app, e con quella i tuoi dati vengono
conservati cifrati: senza, il file dei tuoi conti non si legge nemmeno
copiandolo su un altro computer. Scegline una che ricordi — una frase intera è
meglio di una parola corta e complicata.

**Una chiave di recupero.** L'app te la mostra una volta sola: sono ventiquattro
lettere e numeri. **Scrivila su un foglio e mettila insieme ai documenti**, non
nello stesso computer. Se un giorno dimentichi la password, quella chiave è
l'unico modo per riaprire i tuoi dati. Non c'è nessun altro modo e non c'è
nessuno a cui chiederla: non è una formalità.

**Il tuo nome, la valuta e il primo conto.** Il nome serve solo a salutarti. La
valuta è quella in cui vuoi leggere i totali. Il conto è dove stanno i soldi: il
conto in banca, il portafoglio, una carta — gli altri li aggiungi quando vuoi.

## Domande che vengono a tutti

**Dove finiscono i miei dati?** In una cartella del tuo computer
(`%APPDATA%\My Expense`), e da nessun'altra parte. Non c'è nessun server, non
c'è nessun account, nessuno può vederli. Nemmeno io.

**Come faccio un backup?** Menu in alto a destra → Impostazioni → Backup.
Scrivi la password e scarica il file: dentro c'è tutto, ed è cifrato con quella
password. Mettilo su una chiavetta o su un disco esterno.

**E se cambio computer?** Installa l'app sul computer nuovo, e al primo avvio
scegli una password. Poi Impostazioni → Ripristina backup, e carica il file:
ti chiederà la password che avevi quando quel backup è stato fatto.

**Gli aggiornamenti?** Se ne occupa l'app: quando c'è una versione nuova te lo
dice all'avvio e ti chiede se aggiornare. I tuoi dati non vengono toccati.

**Ho un conto in un'altra valuta.** Va bene: ogni conto ha la sua. I totali
generali li converte nella valuta principale che hai scelto. I cambi si
scaricano da Cambi → Scarica, oppure si scrivono a mano.

**Non funziona / si è rotto qualcosa.** Nella cartella dei dati c'è
`logs\avvio.log`: mandamelo.
