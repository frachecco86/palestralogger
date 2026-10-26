# PalestraLogger

Diario allenamenti mobile-first, installabile come app (PWA) e **completamente offline**.
I dati vivono in un database **SQLite** (compilato in WebAssembly) salvato nel dispositivo tramite IndexedDB.

## Funzionalità

- **Profili utente registrabili**: nome + PIN (4–6 cifre), PIN salvato come hash PBKDF2-SHA256 con salt. Nessun account remoto.
- **Nuovo allenamento**: data, titolo opzionale, note ed esercizi con serie (ripetizioni × peso, incrementi da 2,5 kg).
- **Libreria esercizi**: ~60 esercizi principali pre-caricati (panca piana, leg press, squat, stacco, lat machine, trazioni, military press, curl, hip thrust, plank, cardio…), ricerca con autocompletamento per nome e attrezzatura, filtro per gruppo muscolare.
- **Esercizi personalizzati**: creazione al volo dalla ricerca («Crea "xyz"») con gruppo muscolare e attrezzatura; eliminabili se non usati.
- **Auto-comportamento**: quando aggiungi un esercizio già fatto, vengono proposte le serie dell'ultima volta (stessi carichi/ripetizioni) con il promemoria «Ultima volta …».
- **Calendario**: vista mensile con intensità del volume per giorno, selezione giorno, elenco allenamenti e aggiunta rapida.
- **Statistiche**: allenamenti, volume, serie, ripetizioni, giorni attivi, streak attuale e record, volume per gruppo muscolare, top esercizi, record stimati 1RM (Epley), grafico ultime 8 settimane.
- **Dettaglio esercizio**: storico carico massimo per sessione, sessioni, volume, record.
- **Storia delle versioni**: il numero di versione nel footer apre una modale con le novità spiegate in italiano semplice.
- **Amici**: codice amico separato dal codice sync, richiesta + accettazione, allenamenti e statistiche visibili solo agli amici reciproci. Note condivisibili con un toggle.
- **Sync multi-dispositivo (opzionale)**: codice segreto di 16 caratteri, sincronizzazione automatica di profilo, esercizi e allenamenti tramite Netlify Functions + Netlify Blobs. Nessun account, nessuna email.
- **Backup/ripristino**: esporta e importa l'intero database `.sqlite`.
- **PWA**: manifest, service worker, funzionamento offline, safe-area iOS, tema scuro.

## Stack

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- SQLite via [`sql.js`](https://github.com/sql-js/sql.js) (WASM), persistito su IndexedDB
- `vite-plugin-pwa` (Workbox)
- Sync e amici: Netlify Functions + Netlify Blobs (key-value, API centrale per letture coerenti)
- Hosting: Netlify (build statica + 1 function)

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # dist/
npm run preview
```

Le icone si rigenerano con `npm run icons` (encoder PNG interno, nessuna dipendenza).
Il test del layer dati (SQLite + merge sync) gira in Node: `npm run smoke`.
Dopo `npm run build`, `npm run smoke:browser` avvia l'app in un DOM headless (happy-dom) e simula registrazione, allenamento con note, statistiche. Serve anche a verificare che il wasm `sql-wasm-browser.wasm` venga caricato.

La function di sync è in `netlify/functions/sync.ts`; in locale richiede `npx netlify dev` (con sito linkato) perché Blobs non esiste in `vite dev`.

## Struttura

```
src/
  db/          SQLite: bootstrap, schema, seed esercizi, query tipizzate
  lib/         date, formattazione, hash PIN, sessione, hook live data
  components/  UI kit, bottom nav, picker esercizi, toaster
  screens/     Auth, Home, WorkoutEditor, Calendario, Statistiche, Esercizi, Profilo
scripts/       copia wasm + generazione icone
```

Schema dati:

```
users(id, name, pin_hash, pin_salt, pin_length, created_at)
exercises(id, user_id?, name, muscle, equipment, is_default, created_at)
workouts(id, user_id, date, name, notes, created_at, updated_at)
workout_sets(id, workout_id, exercise_id, entry_index, set_index, reps, weight, rpe)
```

## Sincronizzazione

1. Profilo → **Sync cloud → Attiva sincronizzazione**: viene generato un codice tipo `K7FQ-2M9P-XR4T-8WHD`.
2. Sul secondo dispositivo: schermata di accesso → **Hai già un codice sync?** (o Profilo → Sync) → inserisci il codice.
3. Da quel momento la sync parte all'avvio, al ritorno in foreground e pochi secondi dopo ogni modifica.

Come funziona:

- La copia locale SQLite resta la fonte primaria; la function conserva solo l'ultimo snapshot JSON per codice.
- Il merge è **last-write-wins per entità** (profilo, allenamenti ed esercizi), con tombstone per le cancellazioni, quindi modifiche fatte su dispositivi diversi confluiscono senza duplicati.
- Anche nome e PIN del profilo vengono allineati all'ultima modifica (timestamp `updated_at`): cambiando il PIN su un telefono, sull'altro vale il PIN nuovo.
- Revisione ottimistica: se due dispositivi scrivono insieme, il client rilegge, rifà il merge e ripubblica.
- Il codice non viene mai salvato sul server in chiaro: la chiave del blob è lo SHA-256 del codice.
- I dati sono cifrati in transito (HTTPS) ma **non end-to-end**: Netlify Blobs li conserva leggibili lato server. Chi conosce il codice può leggerli e modificarli, quindi va trattato come una password.
- Disattivando la sync puoi scegliere se rimuovere solo il collegamento locale o eliminare anche la copia cloud.

## Amici — come si diventa amici

1. Profilo → **Sync cloud** deve essere attiva (l'identità dell'account è la sync).
2. Profilo → **Amici → Attiva amici**: viene generato un **codice amico** tipo `K7FQ-2M9P-XR4T` (12 caratteri).
3. Condividi il codice (tasto Condividi/Copia) con la persona che vuoi aggiungere.
4. L'altra persona apre **Amici → Aggiungi un amico**, inserisce il codice e invia la richiesta.
5. Tu la vedi in **Richieste** e scegli **Accetta** o **Rifiuta**.
6. Da quel momento vedete reciprocamente: riepilogo settimanale, streak, volume totale, gruppi muscolari, ultimi 20 allenamenti con esercizi e serie, top esercizi.

Privacy:

- Il codice amico serve solo a inviare una richiesta: **non dà accesso ai dati**.
- Lo snapshot condiviso contiene solo ciò che il client pubblica (ultimi 20 allenamenti); le note sono escluse di default e si attivano con il toggle.
- Rimuovendo un amico o disattivando gli amici, l'accesso ai dati futuri termina; gli amici non ricevono più aggiornamenti.
- Lo snapshot viene ripubblicato automaticamente pochi secondi dopo le modifiche e all'apertura dell'app.

## Privacy e limiti

Senza sync attiva i dati **non lasciano il dispositivo**. Con la sync attiva viaggiano verso Netlify Blobs, protetti dal codice segreto.
Il PIN protegge l'accesso all'app sul telefono, non cifra il database: per una protezione reale usare il blocco schermo del dispositivo.
Le cancellazioni vengono sincronizzate tramite tombstone conservati per 12 mesi.

Per il backup usare **Profilo → Scarica backup**. Il file `.sqlite` può essere riaperto con qualunque strumento SQLite.

## Deploy

Il repository è collegato a Netlify (`netlify.toml`: build `npm run build`, publish `dist`).
In alternativa:

```bash
npm run build
npx netlify deploy --prod --dir=dist
```
