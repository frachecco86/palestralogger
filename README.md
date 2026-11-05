# PalestraLogger

Diario allenamenti mobile-first, installabile come app (PWA), con **account cloud** e
funzionamento offline. I dati vivono in un database **SQLite** (compilato in WebAssembly) che sul
telefono fa da cache, e sono salvati in modo permanente **online** su Netlify Blobs: svuotare i dati
del browser o cambiare telefono non li cancella più.

## Funzionalità

- **Account online**: email + password (PBKDF2-SHA256 con salt, 120k iterazioni). Nessun
  abbonamento, nessuna scadenza, nessun rinnovo.
- **Codice di recupero**: generato alla registrazione (e rigenerabile), permette di reimpostare la
  password senza email. È l'unico modo per rientrare se si dimentica la password.
- **I dati ti seguono**: sull'altro telefono entri con le stesse credenziali e ritrovi profilo,
  esercizi personalizzati, allenamenti, note e statistiche.
- **Offline-first**: in palestra l'app funziona senza rete; le modifiche si allineano appena torna
  il segnale (in background, senza bloccare l'interfaccia).
- **Nuovo allenamento**: data, titolo opzionale, note ed esercizi con serie (ripetizioni × peso,
  incrementi da 2,5 kg).
- **Libreria esercizi**: ~60 esercizi principali pre-caricati (panca piana, leg press, squat, stacco,
  lat machine, trazioni, military press, curl, hip thrust, plank, cardio…), ricerca con
  autocompletamento per nome e attrezzatura, filtro per gruppo muscolare.
- **Esercizi personalizzati**: creazione al volo dalla ricerca («Crea "xyz"») con gruppo muscolare e
  attrezzatura; eliminabili se non usati.
- **Auto-comportamento**: quando aggiungi un esercizio già fatto, vengono proposte le serie
  dell'ultima volta con il promemoria «Ultima volta …».
- **Calendario**: vista mensile con intensità del volume per giorno, selezione giorno, elenco
  allenamenti e aggiunta rapida.
- **Statistiche**: allenamenti, volume, serie, ripetizioni, giorni attivi, streak attuale e record,
  volume per gruppo muscolare, top esercizi, record stimati 1RM (Epley), grafico ultime 8 settimane.
- **Dettaglio esercizio**: storico carico massimo per sessione, sessioni, volume, record.
- **Condivisione come immagine**: card verticale 1080×1920 (9:16) in tre stili — **Completo**,
  **Essenziale**, **Sticker** — con `navigator.share` o salvataggio PNG.
- **Storia delle versioni**: il numero di versione nel footer apre la modale con le novità spiegate
  in italiano semplice.
- **Amici**: codice amico separato dall'account, richiesta + accettazione, allenamenti e statistiche
  visibili solo agli amici reciproci. Note condivisibili con un toggle.
- **Backup/ripristino**: esporta e importa l'intero database `.sqlite`; l'import viene caricato
  anche nel cloud.
- **PWA**: manifest, service worker, funzionamento offline, safe-area iOS, tema scuro.

## Stack

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- SQLite via [`sql.js`](https://github.com/sql-js/sql.js) (WASM), cache locale su IndexedDB
- `vite-plugin-pwa` (Workbox)
- Backend: Netlify Functions + Netlify Blobs (account, dati, amici)
- Hosting: Netlify (build statica + 2 function)

## Perché non si perdono più i dati

La versione 1.x salvava tutto solo nel browser (IndexedDB). iOS e i browser possono cancellare
quello spazio quando manca memoria o dopo lunghi periodi di inattività: il profilo spariva e non
c'era modo di recuperarlo se non si aveva un backup o il codice sync.

Ora:

1. Il **cloud è la fonte di verità**; il database SQLite locale è solo una copia veloce per l'uso
   offline.
2. L'accesso è un **account** (email + password), quindi lo stesso account su un telefono nuovo
   scarica tutto.
3. Se lo spazio locale viene svuotato, al primo avvio basta rifare l'accesso: la copia locale viene
   ricostruita dal cloud.

## Dati e schema

```
users(id, name, created_at, updated_at,          -- id = id dell'account
      pin_hash, pin_salt, pin_length)            -- colonne legacy 1.x, non più usate
exercises(id, user_id?, name, muscle, equipment, is_default, created_at, updated_at)
workouts(id, user_id, date, name, notes, created_at, updated_at)
workout_sets(id, workout_id, exercise_id, entry_index, set_index, reps, weight, rpe)
deleted_records(kind, record_id, user_id, deleted_at)   -- tombstone per le cancellazioni
```

Sul server (Netlify Blobs):

```
palestralogger-accounts
  email/<sha256(email)>        -> id account
  acct/<id>                    -> account (email, hash password, salt, uid social, ...)
  tok/<sha256(token)>          -> sessione
  sess/<id>/<epoch>-<hash>     -> indice sessioni (per revocarle)
  recov/<sha256(codice)>       -> id account (codice di recupero)
  rl/<sha256(email)>           -> tentativi di accesso falliti
palestralogger-sync
  a/<id account>               -> { revision, payload, updatedAt }
  d/<sha256(codice 1.x)>       -> vecchi snapshot (solo per la migrazione)
palestralogger-social
  u/<uid>                      -> profilo social (codice amico, amici, snapshot)
  code/<codice amico>          -> uid
```

## Sincronizzazione

- All'avvio, al ritorno in foreground e pochi secondi dopo ogni modifica il client fa
  **pull → merge → push**.
- Il merge è **last-write-wins per entità** (profilo, allenamenti, esercizi) con tombstone per le
  cancellazioni: modifiche fatte su dispositivi diversi confluiscono senza duplicati.
- Il push è **ottimistico con revisione**: se due dispositivi scrivono insieme, il client rilegge,
  rifà il merge e ripubblica (fino a 4 tentativi).
- Se il payload locale e quello remoto sono identici non viene scritto nulla.
- La sessione è un token casuale di 32 byte salvato sul dispositivo; cambiando la password tutte le
  altre sessioni vengono revocate.

## Migrazione dalla 1.x

- **Dati ancora sul telefono**: al primo accesso con il nuovo account vengono "adottati"
  automaticamente (il profilo locale viene intestato all'account) e caricati nel cloud.
- **Backup `.sqlite`**: Profilo → *Ripristina backup* (oppure importazione guidata subito dopo la
  registrazione).
- **Codice sync di 16 caratteri**: Profilo → *Recupera da codice sync 1.x*. I dati vengono uniti
  all'account e l'identità social storica viene mantenuta, così le amicizie già attive continuano a
  funzionare.

## Privacy e limiti

- I dati sono cifrati in transito (HTTPS) ma **non end-to-end**: Netlify Blobs li conserva leggibili
  lato server. Non c'è pubblicità né condivisione con terzi.
- La password non è mai salvata in chiaro (PBKDF2-SHA256, salt casuale per account). Il token di
  sessione è salvato solo come hash SHA-256 lato server.
- Chi conosce email + password (o il codice di recupero) può accedere all'account: trattali come
  segreti.
- Gli amici vedono solo lo snapshot pubblicato dal client (ultimi 20 allenamenti), con le note
  escluse salvo consenso.
- Il PIN della 1.x non è più usato per l'accesso: la protezione è l'account. Per il blocco rapido del
  telefono resta il blocco schermo del sistema.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # dist/
npm run preview
```

`npm run dev` serve solo il frontend: le function (`/api/account`, `/api/social`) richiedono
`npx netlify dev` con il sito linkato, perché usano Netlify Blobs. Senza backend l'app resta usabile
in locale ma non sincronizza.

Le icone si rigenerano con `npm run icons` (encoder PNG interno, nessuna dipendenza).
Test del layer dati (SQLite, merge sync, adozione dei dati locali): `npm run smoke`.
Dopo `npm run build`, `npm run smoke:browser` avvia l'app in un DOM headless (happy-dom) e simula
registrazione, allenamento con note, statistiche, amici e riavvio con sessione salvata.

## Struttura

```
src/
  db/          SQLite: bootstrap, schema, seed esercizi, query tipizzate, sync payload/merge
  lib/         account (API + sessione), sync, date, formattazione, sessione locale,
               hook live data, social, share-card (immagine allenamento)
  components/  UI kit, bottom nav, picker esercizi, toaster, foglio condivisione, card account
  screens/     Auth, Home, WorkoutEditor, Calendario, Statistiche, Esercizi, Profilo, Amici
netlify/
  functions/   account.ts (registrazione/accesso/sync/recovery), social.ts (amici)
scripts/       copia wasm, generazione icone, smoke test
```

## Deploy

Il repository è collegato a Netlify (`netlify.toml`: build `npm run build`, publish `dist`,
function in `netlify/functions`). Il deploy avviene automaticamente da GitHub Actions a ogni push su
`main`, oppure:

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

Netlify Blobs è incluso nel piano Netlify: nessun database da rinnovare, nessuna scadenza, nessun
costo aggiuntivo per un uso personale.
