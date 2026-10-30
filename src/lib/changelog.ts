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
