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
