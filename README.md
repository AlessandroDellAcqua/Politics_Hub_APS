# Sito Politics Hub APS

Sito statico bilingue (IT/EN) di Politics Hub APS, pronto per GitHub Pages.
Sostituisce il sito Wix mantenendo tutti i contenuti reali estratti da www.politicshub.it.

## Struttura

```
website/
├── index.html          ← pagina radice: rileva la lingua e reindirizza a it/ o en/
├── CNAME               ← dominio personalizzato (www.politicshub.it)
├── robots.txt
├── sitemap.xml         ← generato da _src/build.py
├── assets/
│   ├── css/style.css   ← tutto lo stile del sito (colori, layout, responsive)
│   └── js/main.js      ← menu mobile e piccole interazioni
├── it/                 ← 27 pagine italiane (generate, NON modificare a mano)
├── en/                 ← 27 pagine inglesi (generate, NON modificare a mano)
├── docs/
│   └── wix-images.txt  ← elenco immagini ancora ospitate su Wix (da scaricare!)
└── _src/
    ├── build.py        ← assembla le pagine finali da frammenti + guscio comune
    └── content/
        ├── it/*.html   ← contenuto di ogni pagina italiana (QUI si modifica)
        └── en/*.html   ← contenuto di ogni pagina inglese (QUI si modifica)
```

## Come modificare una pagina

1. Apri il frammento in `_src/content/it/<pagina>.html` (e la versione inglese in `_src/content/en/`).
2. Modifica il testo.
3. Rigenera il sito:

```bash
cd _src
python3 build.py
```

4. Fai commit e push: GitHub Pages si aggiorna da solo.

Titoli, descrizioni SEO e voci di menu si cambiano in `_src/build.py` (dizionario `PAGES` e lista `NAV`).

## Pubblicazione su GitHub Pages

1. Crea un repository (es. `politicshub/sito`) con l'account GitHub **dell'associazione**.
2. Carica il contenuto della cartella `website/` nella radice del repository.
3. Su GitHub: Settings → Pages → Source: `main` branch, cartella `/ (root)`.
4. Il sito sarà su `https://<utente>.github.io/<repo>/`.
5. Quando siete pronti a migrare il dominio: Settings → Pages → Custom domain: `www.politicshub.it`,
   poi dal pannello del dominio puntate il DNS:
   - `www` → CNAME → `<utente>.github.io`
   - apex (`politicshub.it`) → A → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
6. Attivate "Enforce HTTPS" appena il certificato è pronto.

**Non cancellate Wix finché il nuovo sito non è online e verificato.**

## ⚠️ Immagini ancora su Wix

Le immagini sono al momento caricate dai server Wix (`static.wixstatic.com`): quando l'account
Wix verrà chiuso, spariranno. Prima di chiudere Wix:

1. Aprite `docs/wix-images.txt` (elenco completo, rigenerato ad ogni build).
2. Scaricate ogni immagine e salvatela in `assets/img/`.
3. Sostituite gli URL nei frammenti (`_src/content/`) con `../assets/img/<nome>.jpg`.
4. Stesso discorso per i 2 PDF di RiGenerazione (link nella pagina omonima).

Anche i link "Leggi" degli articoli puntano ancora ai post Wix (`politicshub.it/post/...`):
la migrazione degli articoli è il prossimo passo del progetto.

## Pannello di amministrazione (`admin/`)

`admin/index.html` è il pannello per i volontari: pubblica **eventi** e **articoli del Poligono**
senza toccare il codice. Scrive i file `data/events.json` e `data/articles.json` nel repository
tramite le API di GitHub; le pagine pubbliche (eventi, Poligono, articolo) li leggono e si
aggiornano da sole a ogni deploy di GitHub Pages (1–2 minuti dopo la pubblicazione).

Come funziona:

- **Evento** — un solo evento "in programma" alla volta, con layout a scelta (locandina grande,
  standard, solo testo). Pubblicarne uno nuovo archivia il precedente. "Rimuovi evento" fa
  mostrare al sito "nessun evento in programma" + il **mese stimato del prossimo evento**.
- **Articoli** — il nuovo articolo va in evidenza in cima alla pagina del Poligono; quello
  precedente **scende automaticamente nell'archivio** "Articoli precedenti". Gli articoli senza
  `external_url` si aprono su `articolo.html?id=…`; quelli vecchi rimandano ancora ai post Wix.
- **Immagini** — si possono caricare file: finiscono in `assets/img/uploads/`.

Accesso: ogni volontario deve (1) avere un account GitHub aggiunto come collaboratore del
repository, (2) creare un token *fine-grained* (Settings → Developer settings → Fine-grained
tokens) con accesso al solo repo del sito e permesso **Contents: Read and write**, (3) inserirlo
nel pannello. Il token resta solo nel browser del volontario e ogni modifica è un commit a suo
nome (tracciabilità individuale, come raccomandato dall'architettura §10).

Nota: `admin/` è pubblico ma inerte senza token, non è indicizzato (robots + noindex) e può
essere spostato in un repository separato in futuro senza cambiare nulla del sito pubblico.

## Moduli e biglietti QR (`google-apps-script/` + `docs/SETUP-MODULI.md`)

Newsletter e iscrizione eventi salvano i dati in un **Google Sheet sul Drive dell'associazione**
tramite Google Apps Script; un trigger che gira ogni minuto genera i **biglietti QR** e li invia
via email (consegna tipica: 1–2 minuti). Iscrizione eventi: fino a **2 partecipanti** (nome +
cognome ciascuno) con un'unica email; capienza controllata in modo atomico; newsletter: solo email.

Setup completo in **docs/SETUP-MODULI.md**. Dopo il deploy, incolla l'URL dell'app web in
`assets/js/config.js` — finché è vuoto i moduli mostrano il fallback via email.

## Prossimi passi (vedi politics_hub_zero_cost_architecture.md)

- Fase 5: app di check-in iOS/Android (il QR contiene già un codice firmato, verificabile con `verifyQrId`)
- Fase 6: biglietti Apple Wallet
