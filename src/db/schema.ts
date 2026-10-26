import type { Muscle } from '../lib/types'

export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_length INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  muscle TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sets_workout ON workout_sets(workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(user_id);
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

export const SEED_EXERCISES = SEED.map(([slug, name, muscle, equipment]) => ({
  id: `def-${slug}`,
  name,
  muscle,
  equipment,
}))
