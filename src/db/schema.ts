import type { Muscle } from '../lib/types'
import { defaultTracking } from '../lib/types'

export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_length INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  muscle TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT '',
  -- altri nomi per la ricerca (es. «deadlift») separati da virgola
  alias TEXT NOT NULL DEFAULT '',
  -- 'reps' (ripetizioni) oppure 'time' (minuti, per il cardio)
  tracking TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  entry_index INTEGER NOT NULL DEFAULT 0,
  set_index INTEGER NOT NULL,
  reps INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 0,
  rpe REAL,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

-- Note per singolo esercizio dell'allenamento (una riga per esercizio/serie di esercizi).
-- Stanno in una tabella dedicata: le serie restano dati numerici puri.
CREATE TABLE IF NOT EXISTS workout_entry_notes (
  workout_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  entry_index INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workout_id, entry_index),
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercise_photos (
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, exercise_id),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_user ON exercise_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sets_workout ON workout_sets(workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_entry_notes_workout ON workout_entry_notes(workout_id);
CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(user_id);

CREATE TABLE IF NOT EXISTS deleted_records (
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (kind, record_id)
);

CREATE INDEX IF NOT EXISTS idx_deleted_user ON deleted_records(user_id, deleted_at);
`

type Seed = [slug: string, name: string, muscle: Muscle, equipment: string]

// Esercizi principali pre-caricati: selezionabili subito, senza doverli creare.
const SEED: Seed[] = [
  // Petto
  ['panca-piana', 'Panca piana', 'Petto', 'Bilanciere'],
  ['panca-inclinata', 'Panca inclinata', 'Petto', 'Bilanciere'],
  ['panca-declinata', 'Panca declinata', 'Petto', 'Bilanciere'],
  ['panca-inclinata-manubri', 'Panca inclinata manubri', 'Petto', 'Manubri'],
  ['croci-manubri', 'Croci con manubri', 'Petto', 'Manubri'],
  ['croci-cavi', 'Croci ai cavi', 'Petto', 'Cavi'],
  ['chest-press', 'Chest press', 'Petto', 'Macchina'],
  ['pectoral-machine', 'Pectoral machine', 'Petto', 'Macchina'],
  ['dip-parallele', 'Dip alle parallele', 'Petto', 'Corpo libero'],
  ['push-up', 'Push-up', 'Petto', 'Corpo libero'],
  // Schiena
  ['stacco-terra', 'Stacco da terra', 'Schiena', 'Bilanciere'],
  ['stacco-rumeno', 'Stacco rumeno', 'Schiena', 'Bilanciere'],
  ['rematore-bilanciere', 'Rematore con bilanciere', 'Schiena', 'Bilanciere'],
  ['rematore-manubrio', 'Rematore con manubrio', 'Schiena', 'Manubri'],
  ['rematore-t-bar', 'Rematore T-bar', 'Schiena', 'Bilanciere'],
  ['lat-machine', 'Lat machine', 'Schiena', 'Macchina'],
  ['trazioni', 'Trazioni alla sbarra', 'Schiena', 'Corpo libero'],
  ['pulley-basso', 'Pulley basso', 'Schiena', 'Cavi'],
  ['pulldown-braccia-tesa', 'Pulldown a braccia tese', 'Schiena', 'Cavi'],
  ['iperestensioni', 'Iperestensioni', 'Schiena', 'Corpo libero'],
  ['face-pull', 'Face pull', 'Schiena', 'Cavi'],
  // Gambe
  ['squat-bilanciere', 'Squat con bilanciere', 'Gambe', 'Bilanciere'],
  ['front-squat', 'Front squat', 'Gambe', 'Bilanciere'],
  ['hack-squat', 'Hack squat', 'Gambe', 'Macchina'],
  ['leg-press', 'Leg press', 'Gambe', 'Macchina'],
  ['affondi-manubri', 'Affondi con manubri', 'Gambe', 'Manubri'],
  ['squat-bulgaro', 'Squat bulgaro', 'Gambe', 'Manubri'],
  ['leg-extension', 'Leg extension', 'Gambe', 'Macchina'],
  ['leg-curl', 'Leg curl', 'Gambe', 'Macchina'],
  ['stacco-gambe-tese', 'Stacco a gambe tese', 'Gambe', 'Bilanciere'],
  ['calf-in-piedi', 'Calf raise in piedi', 'Gambe', 'Macchina'],
  ['calf-seduto', 'Calf raise seduto', 'Gambe', 'Macchina'],
  ['abductor-machine', 'Abductor machine', 'Gambe', 'Macchina'],
  // Glutei
  ['hip-thrust', 'Hip thrust', 'Glutei', 'Bilanciere'],
  ['glute-bridge', 'Glute bridge', 'Glutei', 'Corpo libero'],
  ['kickback-cavi', 'Kickback ai cavi', 'Glutei', 'Cavi'],
  ['stacco-sumo', 'Stacco sumo', 'Glutei', 'Bilanciere'],
  // Spalle
  ['military-press', 'Military press', 'Spalle', 'Bilanciere'],
  ['lento-avanti-manubri', 'Lento avanti con manubri', 'Spalle', 'Manubri'],
  ['shoulder-press', 'Shoulder press', 'Spalle', 'Macchina'],
  ['alzate-laterali', 'Alzate laterali', 'Spalle', 'Manubri'],
  ['alzate-posteriori', 'Alzate posteriori', 'Spalle', 'Manubri'],
  ['alzate-frontali', 'Alzate frontali', 'Spalle', 'Manubri'],
  ['reverse-fly', 'Reverse fly', 'Spalle', 'Macchina'],
  // Braccia
  ['curl-bilanciere', 'Curl con bilanciere', 'Braccia', 'Bilanciere'],
  ['curl-manubri', 'Curl con manubri', 'Braccia', 'Manubri'],
  ['hammer-curl', 'Hammer curl', 'Braccia', 'Manubri'],
  ['curl-cavi', 'Curl ai cavi', 'Braccia', 'Cavi'],
  ['curl-concentrato', 'Curl concentrato', 'Braccia', 'Manubri'],
  ['french-press', 'French press', 'Braccia', 'Bilanciere'],
  ['pushdown-cavi', 'Pushdown ai cavi', 'Braccia', 'Cavi'],
  ['estensioni-sopra-testa', 'Estensioni sopra la testa', 'Braccia', 'Manubri'],
  ['dip-panca', 'Dip su panca', 'Braccia', 'Corpo libero'],
  // Core
  ['plank', 'Plank', 'Core', 'Corpo libero'],
  ['crunch', 'Crunch', 'Core', 'Corpo libero'],
  ['crunch-cavi', 'Crunch ai cavi', 'Core', 'Cavi'],
  ['leg-raise', 'Leg raise', 'Core', 'Corpo libero'],
  ['ab-wheel', 'Ab wheel', 'Core', 'Attrezzo'],
  ['russian-twist', 'Russian twist', 'Core', 'Manubri'],
  ['side-plank', 'Side plank', 'Core', 'Corpo libero'],
  // Cardio
  ['tapis-roulant', 'Tapis roulant', 'Cardio', 'Macchina'],
  ['cyclette', 'Cyclette', 'Cardio', 'Macchina'],
  ['vogatore', 'Vogatore', 'Cardio', 'Macchina'],
  ['salto-corda', 'Salto con la corda', 'Cardio', 'Attrezzo'],
]

/**
 * Alias (separati da virgola) per trovare gli esercizi pre-caricati anche con
 * il nome inglese o con un sinonimo diffuso in palestra.
 */
const SEED_ALIASES: Record<string, string> = {
  'panca-piana': 'bench press, panca',
  'panca-inclinata': 'incline bench press',
  'panca-declinata': 'decline bench press',
  'panca-inclinata-manubri': 'incline dumbbell press',
  'croci-manubri': 'dumbbell fly, croci',
  'croci-cavi': 'cable crossover, croci ai cavi',
  'chest-press': 'pressa petto, chest press machine',
  'pectoral-machine': 'pec deck, pectoral',
  'dip-parallele': 'dips, parallele',
  'push-up': 'piegamenti, flessioni, push up',
  'stacco-terra': 'deadlift, stacco',
  'stacco-rumeno': 'romanian deadlift, rdl',
  'rematore-bilanciere': 'barbell row, rematore',
  'rematore-manubrio': 'dumbbell row',
  'rematore-t-bar': 't-bar row, t bar',
  'lat-machine': 'lat pulldown, tirate al petto, lat',
  'trazioni': 'pull-up, pull up, trazioni alla sbarra',
  'pulley-basso': 'cable row, pulley',
  'pulldown-braccia-tesa': 'straight arm pulldown',
  'iperestensioni': 'hyperextension, back extension',
  'face-pull': 'face pull, tirate al viso',
  'squat-bilanciere': 'back squat, squat',
  'front-squat': 'front squat, squat avanti',
  'hack-squat': 'hack squat, pressa hack',
  'leg-press': 'pressa 45, pressa gambe, leg press 45',
  'affondi-manubri': 'lunge, affondi, affondi camminati',
  'squat-bulgaro': 'bulgarian split squat, bulgaro',
  'leg-extension': 'leg extension, estensioni gambe',
  'leg-curl': 'leg curl, flexion leg',
  'stacco-gambe-tese': 'stiff leg deadlift, stacco gambe tese',
  'calf-in-piedi': 'calf raise, polpacci in piedi',
  'calf-seduto': 'seated calf raise, polpacci seduto',
  'abductor-machine': 'abductor, abduttori, macchina abduttori',
  'hip-thrust': 'hip thrust, thrust',
  'glute-bridge': 'ponte glutei, glute bridge',
  'kickback-cavi': 'glute kickback, kickback',
  'stacco-sumo': 'sumo deadlift',
  'military-press': 'overhead press, ohp, lento avanti, military',
  'lento-avanti-manubri': 'dumbbell shoulder press, lento manubri',
  'shoulder-press': 'pressa spalle, shoulder press machine',
  'alzate-laterali': 'lateral raise, laterali',
  'alzate-posteriori': 'rear delt fly, posteriori',
  'alzate-frontali': 'front raise, frontali',
  'reverse-fly': 'reverse fly, peck back',
  'curl-bilanciere': 'barbell curl, bicipiti bilanciere',
  'curl-manubri': 'dumbbell curl, bicipiti',
  'hammer-curl': 'hammer curl, curl a martello',
  'curl-cavi': 'cable curl, curl cavi',
  'curl-concentrato': 'concentration curl',
  'french-press': 'skull crusher, tricipiti bilanciere',
  'pushdown-cavi': 'triceps pushdown, push down, tricipiti cavi',
  'estensioni-sopra-testa': 'overhead extension, estensioni tricipiti',
  'dip-panca': 'bench dips, dip panca',
  'plank': 'plank, isometria addominale',
  'crunch': 'crunch, addominali',
  'crunch-cavi': 'cable crunch, crunch cavi',
  'leg-raise': 'leg raise, alzate gambe',
  'ab-wheel': 'ab wheel, ruota addominale',
  'russian-twist': 'russian twist, twist',
  'side-plank': 'side plank, plank laterale',
  'tapis-roulant': 'treadmill, corsa, running',
  'cyclette': 'bike, bicicletta, spinning',
  'vogatore': 'rowing, rowing machine, remo',
  'salto-corda': 'jump rope, corda, skipping',
}

export const SEED_EXERCISES = SEED.map(([slug, name, muscle, equipment]) => ({
  id: `def-${slug}`,
  name,
  alias: SEED_ALIASES[slug] ?? '',
  muscle,
  equipment,
  tracking: defaultTracking(muscle),
}))
