# My Expense — come si installa e come si comincia

Serve un computer Windows. Non serve altro: nessun account, nessun abbonamento,
nessun programma da installare prima. I tuoi dati restano sul tuo computer.

---

## 1. Scarica

Vai qui:

[**Pagina delle versioni di My Expense**](https://github.com/AlessandroFr/my-expense/releases/latest)

Sotto la scritta «Assets» clicca il file che finisce in `.exe` — si chiama
`MyExpense-Setup-` seguito da un numero, per esempio
`MyExpense-Setup-2.0.0.exe`. Sono circa 115 MB, ci mette qualche minuto.

Gli altri due file lì accanto servono al programma per aggiornarsi da solo:
tu non devi toccarli.

---

## 2. Apri il file scaricato

Windows mostra una finestra blu che dice «Windows ha protetto il PC».

Fai così:

1. clicca **Ulteriori informazioni** — è la scritta piccola sotto il messaggio;
2. compare un bottone **Esegui comunque**: cliccalo.

Ecco perché succede, se ti interessa: quel messaggio esce per tutti i programmi
che non hanno pagato un certificato di firma, che costa qualche centinaio di
euro l'anno. Non c'entra niente con i virus.

---

## 3. Installa

Vai avanti fino alla fine. La cartella che ti propone va benissimo.

Quando ha finito trovi **My Expense** nel menu Start e sul desktop.

---

## 4. Il primo avvio

L'app ti fa quattro domande, una alla volta. Ci vogliono due minuti.

### La password

Scrivila due volte e clicca **Continua**.

Serve ad aprire l'app, e con quella i tuoi dati vengono conservati in modo che
solo tu possa leggerli: chi copiasse il file dei tuoi conti su un altro
computer non ci troverebbe niente di leggibile.

Scegline una che ricordi. **Una frase intera è meglio di una parola corta e
complicata**: «il gatto dorme sul divano» è più sicura e più facile di
«Xk7!pQ2».

### La chiave di recupero

L'app ti mostra ventiquattro lettere e numeri, tipo `8QFW-MEZ7-6YUP-4HT4-AHZG-7TSZ`.

**Scrivila su un foglio adesso**, prima di andare avanti. Poi metti il foglio
insieme ai documenti, non nel computer.

Spunta **L'ho scritta e messa al sicuro** e clicca **Continua**.

> ⚠️ Se un giorno dimentichi la password, quella chiave è l'unico modo per
> riaprire i tuoi dati. Non è una formalità e non è un modo di dire: **non
> esiste nessun altro modo, e non c'è nessuno a cui chiederla.** Nemmeno chi ti
> ha dato il programma può farci niente.

### Come ti chiami

Il nome serve solo a salutarti e resta sul tuo computer.

La **valuta** è quella in cui vuoi leggere i totali: se non hai conti
all'estero lascia euro e non pensarci più.

### Il primo conto

Un conto è dove stanno i soldi: il conto in banca, il portafoglio, una carta.

Metti un nome, scegli il tipo, e scrivi **quanto c'è adesso**. Se non lo sai,
lascia zero: si sistema quando vuoi.

Clicca **Comincia**. Da qui in poi l'app è tua.

---

## 5. Le prime cose da fare

**Registra una spesa.** Menu **Movimenti → Spese**: c'è un riquadro a sinistra
per aggiungerne una. Le categorie di partenza ci sono già.

**Oppure carica l'estratto conto della banca**, e in un colpo ci sono tutte.
Scarica dal sito della tua banca il file dei movimenti (di solito è un `.csv`),
poi nella pagina Spese clicca **Estratto conto bancario** e scegli il file.

Prima di scrivere qualsiasi cosa l'app ti fa vedere riga per riga cosa ha
capito, e puoi correggere o saltare quello che vuoi.

**Fai il primo backup** (vedi qui sotto). Fallo subito, non «più avanti».

---

## Il backup

Menu in alto a destra (l'iniziale del tuo nome) → **Impostazioni** → scheda
**Backup**.

Scrivi la password e clicca **Scarica il backup**. Ottieni un file che finisce
in `.mxb`: dentro c'è tutto, movimenti e foto degli scontrini, e si apre solo
con la tua password.

**Mettilo su una chiavetta o su un disco esterno.** Un backup che sta solo nel
computer di cui è la copia non serve a niente: se si rompe quello, si rompono
tutti e due.

### Per rimetterlo

Impostazioni → **Ripristina backup**. Scegli il file, scrivi in maiuscolo la
frase `RIPRISTINA BACKUP` e poi la password.

Attenzione: il ripristino **sostituisce** quello che c'è adesso, non lo unisce.

La password da scrivere è quella che avevi **quando hai fatto quel backup**, che
non è per forza quella di adesso.

---

## Domande che vengono a tutti

**Dove finiscono i miei dati?**
In una cartella del tuo computer, e da nessun'altra parte. Non c'è nessun
server, nessun account, nessuna nuvola: nessuno può vederli, nemmeno chi ha
scritto il programma.

**Cambio computer, come faccio?**
Installa l'app sul computer nuovo e fai il primo avvio come qui sopra. Poi
Impostazioni → Ripristina backup, e carichi il tuo `.mxb`.

**Gli aggiornamenti?**
Se ne occupa l'app: quando c'è una versione nuova te lo dice all'avvio e ti
chiede se aggiornare. Se dici di sì scarica, si chiude e si riapre da sola. I
tuoi dati non vengono toccati. Se dici di no non insiste.

**Ho un conto in valuta estera.**
Ogni conto può avere la sua valuta: si sceglie quando lo crei. Il saldo di quel
conto lo vedi nella sua valuta, così lo confronti con l'estratto della banca; i
totali generali sono convertiti nella valuta principale, al cambio del giorno di
ogni movimento. I cambi si prendono da **Pianifica → Cambi**, bottone
**Scarica**.

**Serve Internet?**
No. L'app funziona senza. Chiedono la rete solo due cose, e nessuna delle due
parte da sola: leggere l'importo dalla foto di uno scontrino, e scaricare i
cambi o le quotazioni.

**Ho dimenticato la password.**
Nella schermata di sblocco clicca **Ho dimenticato la password** e scrivi la
chiave di recupero, quella del foglio. La puoi scrivere come ti viene, con o
senza trattini, maiuscola o minuscola. Subito dopo l'app ti fa scegliere una
password nuova.

Se non hai né la password né la chiave, i dati non si aprono più. Mi dispiace,
ma è proprio quello che li tiene al sicuro.

**Voglio saperne di più su una funzione.**
Dentro l'app: menu in alto a destra → **Guida**. C'è scritto tutto, sezione per
sezione.

**Si è rotto qualcosa.**
Scrivimi, e allega questo file: premi `Windows + R`, incolla
`%APPDATA%\My Expense\logs` e premi Invio — si apre la cartella, il file è
`avvio.log`.
