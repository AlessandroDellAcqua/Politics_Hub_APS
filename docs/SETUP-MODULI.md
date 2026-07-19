# Setup moduli: newsletter, iscrizione eventi e biglietti QR

Questa guida attiva la raccolta dati su Google Sheet e l'invio automatico dei biglietti QR.
Tempo richiesto: ~15 minuti, una sola volta. Serve l'account Google dell'associazione
(consigliato: account Workspace, che ha un limite di ~1500 email/giorno contro le ~100 di un Gmail normale).

## 1. Crea il Google Sheet

1. Vai su Google Drive dell'associazione → Nuovo → Fogli Google.
2. Chiamalo ad esempio **"Politics Hub — Dati sito"**.
3. Non serve creare colonne: le schede si creano da sole al passo 3.

## 2. Installa lo script

1. Nel foglio: **Estensioni → Apps Script**.
2. Cancella il contenuto di `Code.gs` e incolla il file `google-apps-script/Code.gs` di questo repository.
3. Salva (icona dischetto).

## 3. Esegui il setup

1. Nella barra in alto scegli la funzione **`setup`** e premi **Esegui**.
2. Autorizza lo script quando richiesto (Avanzate → Vai a … non verificato → Consenti).
3. Risultato: schede `MailingList`, `Eventi`, `Registrazioni`, `Log` create; chiave segreta QR generata;
   trigger di invio email attivato (**ogni minuto** → biglietti consegnati in 1–2 minuti dall'iscrizione).

## 4. Pubblica l'app web

1. **Deploy → Nuova implementazione → tipo: App web**.
2. Esegui come: **me**. Chi ha accesso: **Chiunque**.
3. Copia l'**URL dell'app web** (finisce con `/exec`).

## 5. Collega il sito

1. Apri `assets/js/config.js` nel repository e incolla l'URL:
   ```js
   window.PH_CONFIG = { FORMS_ENDPOINT: "https://script.google.com/macros/s/…/exec" };
   ```
2. Commit e push. Da questo momento:
   - il modulo newsletter in **Contatti** salva le email nella scheda `MailingList`;
   - il bottone "Iscriviti" dell'evento porta a `iscrizione.html` (modulo integrato).

## 6. Per ogni evento con iscrizioni

1. Pubblica l'evento dal **pannello admin**: dopo la pubblicazione il pannello mostra l'**ID evento**.
2. Nel Google Sheet, scheda **Eventi**, aggiungi una riga:

   | event_id | titolo | data | ora | luogo | max_posti | iscrizioni_aperte |
   |---|---|---|---|---|---|---|
   | (ID dal pannello) | Titolo evento | 2026-09-20 | 18:30 | Sala Ratti, Legnano | 100 | TRUE |

3. Per chiudere le iscrizioni: metti `iscrizioni_aperte` a `FALSE`.

Il controllo di capienza è **atomico** (LockService): due iscrizioni simultanee sull'ultimo posto
non possono causare overbooking. Ogni email può iscriversi una sola volta per evento (max 2 biglietti).

## Come funziona l'invio dei biglietti

1. L'iscrizione scrive le righe in `Registrazioni` con `email_inviata = FALSE`.
2. Ogni minuto il trigger `sendPendingTickets` prende le righe non inviate, genera i QR
   (uno per partecipante, con firma anti-contraffazione) e manda **una sola email** con tutti i biglietti.
3. Se un invio fallisce resta `FALSE` e viene ritentato al minuto successivo.

Il QR contiene un codice tipo `PH26-K7Q9-M2LA.3F8A21BC` (casuale + firmato): sarà verificato
dall'app di check-in (Fase 5) con la funzione `verifyQrId` già inclusa.


## ⚠️ Quando modifichi Code.gs: serve un nuovo deploy

Incollare il nuovo codice **non basta**: l'URL /exec continua a servire la versione vecchia.
Ogni volta che aggiorni Code.gs:

1. Incolla il codice e salva.
2. Esegui una volta `setup` (autorizza i nuovi permessi se richiesti, es. Drive).
3. **Deploy → Gestisci implementazioni → ✏️ Modifica → Versione: "Nuova versione" → Implementa.**
   L'URL resta lo stesso: non serve toccare config.js.

Senza il passo 3 succedono cose come "l'email di benvenuto non arriva": il codice nuovo
esiste ma online gira ancora quello vecchio.

## Aprire le iscrizioni di un evento (flusso consigliato)

Usa la scheda **Gestione** dell'app volontari: "Pubblica sito + apri iscrizioni" fa tutto
in un tocco (pubblica su GitHub **e** crea/apre la riga nella scheda Eventi con lo stesso id).
Se un evento risulta "iscrizioni non aperte" sul sito, apri Gestione: il pannello di stato
dice esattamente se manca la riga nel foglio o se è solo chiusa, con il bottone per sistemare.

## Drive nell'app (DRIVE_ROOT_ID)

1. Apri su Drive la cartella radice dell'archivio (es. "Politics Hub Drive").
2. Copia l'ID dall'URL: drive.google.com/drive/folders/**QUESTO_ID**.
3. Apps Script → ⚙️ Impostazioni progetto → Proprietà dello script → aggiungi
   `DRIVE_ROOT_ID` = quell'ID → salva → esegui una volta `setup` (autorizza Drive) → nuovo deploy.
L'app scarica la STRUTTURA (solo nomi), la salva sul telefono per navigare all'istante,
e apre i file su Drive solo quando li tocchi.

## Rubrica e link utili (Home dell'app)

Nel foglio compaiono (al primo uso) le schede **Rubrica** (nome, ruolo, email, telefono,
gruppo) e **LinkUtili** (titolo, url, gruppo): compilale e appariranno nella Home dell'app.

## Email di benvenuto newsletter

Alla prima iscrizione di un'email viene inviata subito una conferma di benvenuto
(se l'invio fallisce, l'iscrizione resta comunque salvata; vedi scheda Log).

## Note

- **Privacy/GDPR**: si salvano solo email (newsletter) e nome, cognome, email (eventi), con consenso
  esplicito e timestamp. Le informative sono già linkate nei moduli. Limita l'accesso al foglio.
- **Quote email**: Workspace ~1500 destinatari/giorno. Per eventi più grandi valutare un provider dedicato.
- **QR**: le immagini sono generate via quickchart.io al momento dell'invio; nel biglietto c'è anche
  il codice testuale come riserva.
- **Test consigliato**: iscriviti tu stesso con 2 partecipanti, controlla lo Sheet, l'arrivo dell'email
  e i tempi (1–2 min), poi cancella le righe di prova.
