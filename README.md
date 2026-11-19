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
- **Offline-first**: in palestra l'app funziona senza rete; l'allenamento si salva subito sul
  telefono (un avviso lo conferma) e le modifiche si allineano appena torna il segnale, in
  background e senza bloccare l'interfaccia. Al ritorno della connessione la sincronizzazione
  riparte da sola, senza dover riaprire l'app.
- **Nuovo allenamento**: data, titolo opzionale, note ed esercizi con serie (ripetizioni × peso,
  incrementi da 2,5 kg). Gli esercizi **cardio** si registrano in **minuti** (niente ripetizioni né
  peso) e accanto al nome compare l’etichetta «minuti». Ogni esercizio ha un suo campo **note**
  (tecnica, sensazioni, presa, fastidi…): si scrive in modalità «Modifica», resta visibile in lettura
  e viene sincronizzato nel cloud. Data, titolo e note stanno in una **card chiusa di default**
  che si apre al tocco; gli esercizi di un allenamento salvato restano compressi (si aprono con la
  freccia) e la cancellazione di esercizi/serie richiede la modalità «Modifica». In «Modifica» si
  **trascinano gli esercizi** dalla maniglia per riordinarli (con serie e note): l'ordine viene
  salvato e sincronizzato. La maniglia risponde anche alle frecce su/giù. Dopo il salvataggio di un
  allenamento esistente si resta sulla sua pagina, senza tornare in home.
- **Libreria esercizi**: ~60 esercizi principali pre-caricati (panca piana, leg press, squat, stacco,
  lat machine, trazioni, military press, curl, hip thrust, plank, cardio…), ricerca con
  autocompletamento per **nome, alias e attrezzatura**, filtro per gruppo muscolare. Gli esercizi
  pre-caricati hanno già gli alias più comuni («deadlift», «bench press», «treadmill»…), mentre ogni
  esercizio personale può avere i propri.
- **Foto esercizio**: una foto per esercizio (macchina, attrezzo, posizione), compressa sul telefono,
  visibile in miniatura accanto al nome e salvata anche nel cloud. La pagina **Esercizi** mostra la
  miniatura di ogni esercizio (con riquadro segnaposto se la foto manca) e, aprendo l'esercizio,
  l'immagine in grande.
- **Ruolo amministratore**: le foto degli esercizi pre-caricati sono una **libreria unica condivisa**
  fra tutti gli account. Solo l'account amministratore (`francescochecco@gmail.com`, vedi
  `ADMIN_EMAILS` in `netlify/functions/account.ts` e `photo.ts`) può aggiungerle, sostituirle o
  rimuoverle; il server risponde `403 admin_only` agli altri account, che possono solo leggerle.
  L'amministratore può anche **eliminare dalla pagina Esercizi qualsiasi esercizio della libreria
  comune** (anche di un altro autore) **e gli esercizi pre-caricati**, con conferma: spariscono per
  tutti gli account, mentre gli allenamenti passati che li citano restano leggibili. Anche i
  pre-caricati (`def-*`) vengono nascosti tramite una lista sul server, così la scelta vale su ogni
  dispositivo.
- **Foto dei propri esercizi**: chi crea un esercizio (id casuale, non `def-*`) può caricarne la foto
  già nella creazione e gestirla dalla pagina Esercizi, senza essere amministratore. Se l'esercizio
  è condiviso con tutti, la foto passa nella libreria comune e la gestisce il suo autore (o
  l'amministratore). In ogni caso le foto si modificano **solo** dalla pagina Esercizi: dentro la
  creazione/modifica di un allenamento sono in sola lettura.
- **Peso in un tocco**: in modifica la serie ha «applica a tutte» per copiare i kg su tutte le altre.
- **Esercizi personalizzati**: creazione e **modifica** dalla pagina Esercizi (nome, **alias**,
  gruppo muscolare, attrezzatura e misura delle serie: ripetizioni o minuti), creazione al volo
  dalla ricerca («Crea "xyz"»); eliminabili se non usati. Il cardio nasce già in minuti, ma la
  misura si può cambiare in entrambi i sensi. L'alias è un campo facoltativo con altri nomi
  separati da virgola: la ricerca trova l'esercizio con tutti.
- **Libreria comune degli esercizi**: i nuovi esercizi entrano nella libreria condivisa da tutti gli
  account (interruttore «Disponibile a tutti», acceso di default). Ognuno vede quelli degli altri
  con l'etichetta **condiviso** e il nome di chi li ha proposti; solo l'autore può modificarli o
  ritirarli. Funziona anche offline: la condivisione resta in coda e riparte al ritorno della rete.
- **Passaggio automatico dei vecchi esercizi**: alla prima apertura della 2.7.x gli esercizi
  personali creati prima del rilascio della libreria comune vengono pubblicati una volta sola
  (a blocchi, con le foto). Gli esercizi creati dopo seguono solo l'interruttore del form.
- **Auto-comportamento**: quando aggiungi un esercizio già fatto, vengono proposte le serie
  dell'ultima volta con il promemoria «Ultima volta …».
- **Calendario**: vista mensile con intensità del volume per giorno, selezione giorno, elenco
  allenamenti e aggiunta rapida.
- **Statistiche**: allenamenti, volume, serie, ripetizioni, giorni attivi, streak attuale e record,
  volume per gruppo muscolare, top esercizi, record stimati 1RM (Epley), grafico ultime 8 settimane.
- **Dettaglio esercizio**: storico carico massimo per sessione, sessioni, volume, record.
- **Duplica allenamento**: un tasto nella sessione salvata crea una copia di oggi con esercizi,
  serie e note (usa anche le modifiche non ancora salvate).
- **Condividi un allenamento con un utente**: scegli un altro account e gli invii una copia
  portabile (nomi degli esercizi, serie, note). Per ora **tutti gli utenti si vedono** (solo nome,
  nessuna email). Chi la riceve la trova nella posta in arrivo della home, la importa come
  allenamento di oggi (esercizi abbinati per nome o creati) e poi la modifica e la salva.
- **Condivisione come immagine**: card verticale 1080×1920 (9:16) in due versioni — **Con foto**
  (sfondo caricato dal telefono, in stile Strava) e **Solo dati** — con `navigator.share` o
  salvataggio PNG. Contiene nome, data, titolo, numero di serie, esercizi con i carichi (es. «2 da
  40 kg · 3 da 10 kg») e footer con nome dell'app e testo del footer.
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
- Backend: Netlify Functions + Netlify Blobs (account, dati, esercizi condivisi, foto, amici,
  allenamenti condivisi)
- Hosting: Netlify (build statica + 5 function)

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
exercises(id, user_id?, name, alias, muscle, equipment, tracking, is_default, archived, created_at, updated_at)
                                                 -- alias: altri nomi per la ricerca (2.8.0)
                                                 -- tracking: 'reps' | 'time' (minuti, 2.6.0)
                                                 -- archived: tolto dalla libreria ma citato dallo storico (2.11.0)
workouts(id, user_id, date, name, notes, created_at, updated_at)
workout_sets(id, workout_id, exercise_id, entry_index, set_index, reps, weight, rpe)
workout_entry_notes(workout_id, exercise_id, entry_index, note)  -- note per esercizio (2.5.0)
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
palestralogger-photos
  idx/library                  -> indice della libreria condivisa (esercizi pre-caricati e condivisi)
  p/library/<esercizio>        -> immagine compressa (JPEG/PNG/WebP)
  idx/<id account>             -> indice delle foto private (esercizi creati dall'utente)
  p/<id account>/<esercizio>   -> immagine compressa privata
  x/<library o id account>/<esercizio> -> tombstone di cancellazione
palestralogger-exercises
  library                      -> { exercises: [...] } libreria comune (autore, nome, gruppo, misura)
palestralogger-workout-shares
  s/<uid destinatario>/<ts-id> -> { fromUid, fromName, createdAt, workout } allenamento condiviso
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
- La **libreria comune degli esercizi** si allinea con cache di 5 minuti (`/api/exercises`): pull
  all'avvio/ritorno in foreground, push delle condivisioni createsi offline dalla coda locale. Gli
  esercizi condivisi sono salvati come `user_id NULL` e non entrano nel payload personale. Quando
  un esercizio viene ritirato o eliminato dal server, la copia locale non si cancella se qualche
  allenamento passato lo usa: viene marcata `archived = 1` e sparisce solo dalle liste. I segnaposto
  creati quando un allenamento cita un esercizio non ancora arrivato restano nascosti, non vengono
  inviati al cloud e lasciano il posto al nome vero appena i dati sono disponibili.
- La **migrazione una tantum** degli esercizi creati prima della 2.7.0 (`created_at` < data di
  rilascio) accoda la pubblicazione al primo avvio; l'avvenuta migrazione è marcata in
  `localStorage` per account, così non viene ripetuta.

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
- Gli esercizi della **libreria comune** (creati con «Disponibile a tutti», attivo di default) sono
  visibili a tutti gli account insieme al nome dell'autore: non usare nomi con dati personali. Puoi
  ritirarli in qualsiasi momento dalla modifica dell'esercizio.
- La **condivisione di un allenamento** è esplicita e va a un singolo utente scelto: vengono inviati
  nome, note, esercizi e serie di quell'allenamento (non foto né id personali). Finché è attiva la
  modalità «tutti gli utenti si vedono», l'elenco degli account è visibile a chiunque con il solo
  nome (mai l'email). Gli allenamenti ricevuti restano nella posta finché non li importi o li
  elimini.
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

`npm run dev` serve solo il frontend: le function (`/api/account`, `/api/exercises`, `/api/photo`,
`/api/social`, `/api/workouts`) richiedono `npx netlify dev` con il sito linkato, perché usano
Netlify Blobs. Senza backend l'app resta usabile in locale ma non sincronizza.

Le icone si rigenerano con `npm run icons` (encoder PNG interno, nessuna dipendenza).
Test del layer dati (SQLite, merge sync, adozione dei dati locali): `npm run smoke`.
Dopo `npm run build`, `npm run smoke:browser` avvia l'app in un DOM headless (happy-dom) e simula
registrazione, allenamento con note, statistiche, amici e riavvio con sessione salvata.

## Struttura

```
src/
  db/          SQLite: bootstrap, schema, seed esercizi, query tipizzate, sync payload/merge,
               foto esercizio (BLOB locale)
  lib/         account (API + sessione), sync, date, formattazione, sessione locale,
               hook live data, social, share-card (immagine allenamento),
               workout-share (condivisione/import allenamenti)
  components/  UI kit, bottom nav, picker esercizi, toaster, fogli di condivisione, card account
  screens/     Auth, Home, WorkoutEditor, Calendario, Statistiche, Esercizi, Profilo, Amici
netlify/
  functions/   account.ts (registrazione/accesso/sync/recovery), photo.ts (foto esercizi),
               exercises.ts (libreria comune), workouts.ts (condivisione allenamenti),
               social.ts (amici)
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
