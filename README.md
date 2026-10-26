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
- **Backup/ripristino**: esporta e importa l'intero database `.sqlite`.
- **PWA**: manifest, service worker, funzionamento offline, safe-area iOS, tema scuro.

## Stack

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- SQLite via [`sql.js`](https://github.com/sql-js/sql.js) (WASM), persistito su IndexedDB
- `vite-plugin-pwa` (Workbox)
- Hosting: Netlify (build statica)

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # dist/
npm run preview
```

Le icone si rigenerano con `npm run icons` (encoder PNG interno, nessuna dipendenza).

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

## Privacy e limiti

I dati **non lasciano il dispositivo**: non c'è backend né sincronizzazione tra dispositivi.
Il PIN protegge l'accesso all'app sul telefono, non cifra il database: per una protezione reale usare il blocco schermo del dispositivo.

Per il backup usare **Profilo → Scarica backup**. Il file `.sqlite` può essere riaperto con qualunque strumento SQLite.

## Deploy

Il repository è collegato a Netlify (`netlify.toml`: build `npm run build`, publish `dist`).
In alternativa:

```bash
npm run build
npx netlify deploy --prod --dir=dist
```
