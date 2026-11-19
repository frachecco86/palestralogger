export interface ChangelogEntry {
  version: string
  title: string
  items: string[]
}

/**
 * Storia delle versioni in linguaggio semplice.
 * La più recente va per prima.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.11.2',
    title: 'L’amministratore elimina anche gli esercizi pre-caricati',
    items: [
      'L’amministratore può eliminare dalla pagina Esercizi anche gli esercizi pre-caricati (panca, squat, tapis roulant…), con conferma.',
      'La scelta vale per tutti gli account: gli esercizi spariscono dalla libreria alla sincronizzazione successiva, anche sui dispositivi nuovi.',
      'Gli allenamenti passati che li citano restano intatti e leggibili; senza connessione l’eliminazione resta in coda.',
    ],
  },
  {
    version: '2.11.1',
    title: 'I nomi degli esercizi tornano al loro posto',
    items: [
      'Corretto un bug per cui alcuni esercizi creati e condivisi potevano comparire come «Esercizio sincronizzato» al posto del loro nome.',
      'I segnaposto creati dalla sincronizzazione ora restano nascosti e vengono sostituiti dal nome vero appena arrivano i dati dal cloud o dalla libreria comune.',
      'I segnaposto non vengono più inviati al cloud e non possono più sovrascrivere il nome di un esercizio esistente.',
    ],
  },
  {
    version: '2.11.0',
    title: 'L’amministratore elimina gli esercizi (e si allena anche offline)',
    items: [
      'Eliminare un esercizio chiede sempre conferma. Se sei l’amministratore puoi togliere dalla libreria comune anche gli esercizi condivisi da altri account: spariscono per tutti.',
      'Gli allenamenti passati che citano un esercizio eliminato restano intatti e leggibili.',
      'Senza connessione l’allenamento si salva subito sul telefono: un avviso te lo conferma e il cloud si aggiorna appena torna la rete.',
      'Quando la connessione torna, la sincronizzazione riparte da sola; se un tentativo non riesce l’app ci riprova anche senza riaprirla.',
      'La card Account mostra quando sei offline e mette in pausa il tasto «Sincronizza ora».',
    ],
  },
  {
    version: '2.10.1',
    title: 'Riordina trascinando gli esercizi',
    items: [
      'Le frecce piccole sono state sostituite da una maniglia: in modalità «Modifica» tieni premuto e trascina l’esercizio su o giù.',
      'L’ordine si aggiorna mentre trascini, con una leggera evidenziazione dell’esercizio che stai spostando; poi tocca «Aggiorna».',
      'La maniglia funziona anche con la tastiera: frecce su e giù per spostare l’esercizio di una posizione.',
      'Serie e note seguono l’esercizio, e l’ordine resta salvato e sincronizzato come prima.',
    ],
  },
  {
    version: '2.10.0',
    title: 'Gli esercizi, nell’ordine che vuoi',
    items: [
      'In un allenamento salvato puoi riordinare gli esercizi con le frecce su e giù, in modalità «Modifica».',
      'L’ordine segue l’esercizio: le sue serie e le note si spostano con lui.',
      'Dopo «Aggiorna» l’ordine resta salvato e arriva anche sugli altri dispositivi con la sincronizzazione.',
      'Le frecce sono spente per il primo e per l’ultimo esercizio, così non si esce dall’elenco.',
    ],
  },
  {
    version: '2.9.0',
    title: 'Allenamenti da duplicare e da condividere',
    items: [
      'Nuovo tasto «Duplica» nell’allenamento: crea subito una copia di oggi con gli stessi esercizi, serie e note (anche le modifiche non ancora salvate).',
      'Nuovo tasto «Invia a un utente»: scegli un altro account e gli mandi una copia dell’allenamento con esercizi, serie e note.',
      'Per ora tutti gli utenti si vedono: nella scelta compaiono tutti gli account, con il nome (nessuna email).',
      'Nella home c’è la scheda «Allenamenti condivisi»: mostra quanti ne hai ricevuti e apre la posta in arrivo.',
      'Importando un allenamento ricevuto nasce una copia di oggi: gli esercizi vengono abbinati per nome (o creati se mancano) e poi puoi modificarla e salvarla come vuoi.',
      'Un allenamento importato viene tolto dalla posta; puoi anche eliminarlo senza importarlo.',
      'Se il server non risponde la posta resta com’è e riprovi più tardi; l’invio richiede la rete.',
    ],
  },
  {
    version: '2.8.0',
    title: 'Un alias per ogni esercizio',
    items: [
      'Ogni esercizio può avere un alias: altri nomi con cui trovarlo nella ricerca. Es. per «Stacco da terra»: deadlift, stacco.',
      'Nella creazione e nella modifica c’è il campo facoltativo «Alias»: scrivi più nomi separati da virgola.',
      'La ricerca guarda nome, alias e attrezzatura: «bench press», «panca» o «bilanciere» trovano lo stesso esercizio. Vale sia nella pagina Esercizi sia nel selettore dell’allenamento.',
      'Gli esercizi pre-caricati hanno già gli alias più comuni (deadlift, bench press, OHP, pull-up, treadmill, rowing…).',
      'Gli alias viaggiano con la sincronizzazione e con la libreria comune: chi ha condiviso un esercizio può aggiornarli per tutti.',
      'Aprendo un esercizio vedi la riga «Si trova anche come: …», così sai quali nomi funzionano.',
    ],
  },
  {
    version: '2.7.1',
    title: 'Anche i vecchi esercizi passano a tutti',
    items: [
      'Una volta sola, all’apertura dell’app, gli esercizi che avevi creato prima della libreria comune vengono condivisi automaticamente con tutti gli account, con le loro foto.',
      'La condivisione avviene in coda e a blocchi: se hai molti esercizi ci vogliono un paio di avvii, e funziona anche se sei offline (riparte appena torni online).',
      'Se nella libreria comune esiste già un esercizio con lo stesso nome, il tuo resta privato: puoi rinominarlo e condividerlo dalla modifica.',
      'Dopo questo passaggio valgono le regole normali: «Disponibile a tutti» acceso o spento per ogni esercizio e solo l’autore può modificare o ritirare i propri.',
      'Gli esercizi creati dopo il rilascio della libreria comune non vengono toccati: valgono solo le tue scelte nel form.',
    ],
  },
  {
    version: '2.7.0',
    title: 'Gli esercizi sono di tutti',
    items: [
      'I nuovi esercizi che crei entrano nella libreria comune: li vedono e li usano tutti gli account, su ogni dispositivo.',
      'Nel form di creazione c’è l’interruttore «Disponibile a tutti», già acceso: puoi spegnerlo per tenere un esercizio solo per te.',
      'Gli esercizi della libreria comune hanno l’etichetta «condiviso» e il nome di chi li ha proposti.',
      'Chi ha condiviso un esercizio può modificarlo (nome, gruppo muscolare, ripetizioni o minuti) o ritirarlo quando vuole; gli altri account lo possono usare ma non modificare.',
      'Anche la foto viaggia con l’esercizio condiviso: entra nella libreria comune e la gestisce chi lo ha proposto (o l’amministratore).',
      'Se sei offline la condivisione resta in coda e riparte da sola appena torna il segnale: l’esercizio non si perde.',
      'Gli esercizi pre-caricati restano come prima: ci sono già su ogni telefono e non richiedono condivisione.',
    ],
  },
  {
    version: '2.6.0',
    title: 'Il cardio si misura in minuti',
    items: [
      'Gli esercizi cardio (tapis roulant, cyclette, vogatore, salto con la corda…) ora si registrano in minuti: al posto delle ripetizioni trovi un campo «Minuti», senza il peso.',
      'Accanto al nome dell’esercizio compare l’etichetta «minuti», così riconosci subito come verrà misurata la serie: funziona anche nella ricerca degli esercizi e nell’immagine condivisa.',
      'Il totale dell’allenamento non conta il cardio nel volume (kg): i minuti non sporcano più i carichi.',
      'Puoi scegliere la misura quando crei un esercizio e cambiarla quando vuoi dalla pagina Esercizi: da «Ripetizioni» a «Minuti» e viceversa.',
      'Nella pagina Esercizi c’è ora «Modifica»: nome, gruppo muscolare, attrezzatura e misura si cambiano anche dopo aver creato l’esercizio.',
      'La scelta viaggia con il tuo account: la ritrovi sincronizzata sugli altri telefoni e anche gli amici vedono «min» al posto delle ripetizioni.',
    ],
  },
  {
    version: '2.5.0',
    title: 'Una nota per ogni esercizio',
    items: [
      'Ogni esercizio dell’allenamento ha ora il suo campo note: scrivi tecnica, presa, sensazioni o fastidi senza mescolarli con le note della sessione.',
      'Le note dell’esercizio si scrivono in modalità «Modifica» e restano leggibili sotto le serie quando l’allenamento è in sola lettura.',
      'Con gli esercizi compressi la nota compare in anteprima sotto il nome: la vedi senza aprire la scheda.',
      'Le note viaggiano con l’allenamento: vengono salvate nel cloud e sincronizzate sugli altri dispositivi insieme alle serie.',
    ],
  },
  {
    version: '2.4.0',
    title: 'L’immagine dell’allenamento, in due versioni',
    items: [
      'Condivisione più semplice: due sole versioni, «Con foto» e «Solo dati».',
      'Nella versione «Con foto» puoi caricare un’immagine dal telefono e usarla come sfondo, in stile Strava: la foto resta sul telefono e non viene caricata sul cloud.',
      'Su ogni immagine trovi il tuo nome, la data, il nome dell’allenamento, il numero di serie e gli esercizi con il dettaglio dei carichi (es. «2 da 40 kg · 3 da 10 kg»).',
      'In fondo ci sono il nome dell’app e il testo del footer.',
      'Se gli esercizi sono tanti, l’immagine mostra i primi e il numero di quelli che restano.',
    ],
  },
  {
    version: '2.3.1',
    title: 'Registrazione senza pulsanti bloccati',
    items: [
      'Il pulsante «Crea account» ora è sempre attivo: se manca qualcosa l’app dice esattamente cosa (email non valida, nome troppo corto, password di meno di 8 caratteri, password diverse).',
      'Risolto il caso in cui la compilazione automatica del browser riempiva i campi senza aggiornare l’app: il pulsante restava spento senza spiegazioni.',
      'Lo stesso vale per «Entra» e «Reimposta password»: messaggi chiari al posto del pulsante disattivato.',
    ],
  },
  {
    version: '2.3.0',
    title: 'La foto del tuo nuovo esercizio',
    items: [
      'Quando crei un esercizio puoi già scegliere una foto: la vedi in anteprima e viene caricata insieme all’esercizio.',
      'La foto di un esercizio che hai creato è tua: puoi aggiungerla, sostituirla o rimuoverla dalla pagina Esercizi senza essere amministratore.',
      'Le immagini degli esercizi pre-caricati restano nella libreria condivisa e le gestisce solo l’amministratore.',
      'Le foto personali sono private: restano nel tuo account e non sono visibili agli altri utenti.',
    ],
  },
  {
    version: '2.2.0',
    title: 'Immagini degli esercizi, gestite dall’amministratore',
    items: [
      'La pagina Esercizi (dal menù in basso) mostra la miniatura di ogni esercizio; se la foto manca c’è un riquadro segnaposto.',
      'Aprendo un esercizio la foto si vede in grande, sopra sessioni, volume, record e andamento del carico.',
      'Le immagini si possono aggiungere, sostituire o rimuovere solo dalla pagina Esercizi e solo con l’account amministratore: durante la creazione o la modifica di un allenamento sono in sola lettura.',
      'La libreria delle immagini è unica e condivisa: l’amministratore la riempie una volta e tutti la vedono, su ogni dispositivo.',
      'Il ruolo amministratore è legato all’email dell’account ed è verificato anche dal server: nessun altro account può cambiare le foto.',
    ],
  },
  {
    version: '2.1.1',
    title: 'Le foto anche nella ricerca',
    items: [
      'Quando aggiungi un esercizio all’allenamento, nella lista compare la miniatura della foto accanto al nome: così riconosci subito la macchina giusta.',
      'Le miniature mancanti si scaricano dal cloud all’apertura della lista; senza foto resta solo la barra colorata del gruppo muscolare.',
      'Le immagini sono salvate nel tuo account (cloud) e in copia sul telefono: restano visibili anche offline.',
    ],
  },
  {
    version: '2.1.0',
    title: 'Foto degli esercizi e peso al volo',
    items: [
      'Puoi aggiungere una foto a ogni esercizio (la macchina, l’attrezzo, la tua posizione): compare in piccolo accanto al nome.',
      'Nuovo tasto «applica a tutte» accanto al peso: copia i kg della serie che stai modificando su tutte le altre, senza reinserirli.',
      '«Aggiungi esercizio» ora è disponibile solo in modalità modifica: niente più cambi di modalità automatici.',
      'La foto viene compressa sul telefono, resta disponibile offline ed è salvata anche nel tuo account: la ritrovi su ogni dispositivo.',
      'Tocca la miniatura per vederla in grande.',
    ],
  },
  {
    version: '2.0.2',
    title: 'Lettura davvero in sola lettura',
    items: [
      'Corretto: in un allenamento salvato «Aggiungi serie» era ancora attivo anche senza modalità modifica.',
      'Ora senza toccare «Modifica» carichi e ripetizioni si leggono soltanto: niente pulsanti +/–, niente aggiunta o rimozione di serie.',
      'Con «Modifica» tornano tutti i comandi. Un allenamento nuovo parte già in modifica, uno salvato si apre in lettura.',
    ],
  },
  {
    version: '2.0.1',
    title: 'Niente più tocchi per sbaglio',
    items: [
      'Nell’allenamento gli esercizi salvati ora sono compatti: si aprono con la freccia e occupano meno spazio.',
      'Per cancellare un esercizio o una serie devi prima toccare «Modifica»: il cestino non è più a portata di dito.',
      'Quando la modifica è attiva un avviso te lo ricorda; tocca «Fine» per tornare alla lettura.',
    ],
  },
  {
    version: '2.0.0',
    title: 'I tuoi allenamenti non si perdono più',
    items: [
      'Ora c’è un account: entri con email e password e ritrovi tutti i tuoi allenamenti su qualsiasi telefono.',
      'I dati non vivono più solo nella memoria del browser: svuotare i dati del telefono o cambiare dispositivo non li cancella.',
      'Il codice di recupero, da conservare, permette di reimpostare la password se la dimentichi.',
      'L’app continua a funzionare in palestra anche senza rete: appena torna il segnale si allinea da sola.',
      'Chi usava la versione 1.x ritrova i suoi dati: vengono caricati nel nuovo account al primo accesso (o con il vecchio codice sync).',
      'Il servizio è ospitato su Netlify, non ha abbonamenti e non scade.',
    ],
  },
  {
    version: '1.4.0',
    title: 'Condividi l’allenamento',
    items: [
      'Nuovo pulsante «Condividi come immagine» dentro l’allenamento: crea una card verticale pronta per storie, chat e social.',
      'Tre stili tra cui scegliere con anteprima: completo, essenziale e sticker.',
      'Puoi condividere con il menu del telefono oppure salvare l’immagine nella galleria.',
    ],
  },
  {
    version: '1.3.0',
    title: 'La storia delle novità',
    items: [
      'Il numero di versione, ora nel footer, apre questa finestra: puoi vedere com’è cresciuta l’app, versione dopo versione.',
      'Tutto spiegato con parole semplici, senza termini tecnici.',
    ],
  },
  {
    version: '1.2.0',
    title: 'Amici e firma',
    items: [
      'Puoi aggiungere amici con un codice personale e, solo dopo che accettano, vedere i loro allenamenti e progressi.',
      'Scegli tu se condividere anche le note delle tue sessioni: di base restano private.',
      'Il nome dell’app compare nel footer.',
    ],
  },
  {
    version: '1.1.2',
    title: 'Riavvio sereno',
    items: [
      'Risolto un problema che al riavvio poteva lasciare lo schermo nero.',
      'Se qualcosa non va, ora compare un messaggio chiaro con il pulsante «Ricarica» invece di una pagina vuota.',
    ],
  },
  {
    version: '1.1.1',
    title: 'Apertura garantita',
    items: [
      'Corretto un errore che su alcuni telefoni impediva di aprire il diario.',
    ],
  },
  {
    version: '1.1.0',
    title: 'Sincronia',
    items: [
      'Puoi portare profilo e allenamenti su più dispositivi con un codice segreto.',
      'Aggiunte le note della sessione, visibili anche nell’elenco degli allenamenti.',
      'Nome e PIN restano allineati tra i tuoi dispositivi.',
    ],
  },
  {
    version: '1.0.0',
    title: 'Si comincia',
    items: [
      'Profili personali con PIN e diario degli allenamenti con esercizi e serie.',
      'Calendario, statistiche e record personali.',
      'Libreria di esercizi pronta all’uso e backup dei dati.',
      'Funziona anche senza connessione e si installa sul telefono.',
    ],
  },
]
