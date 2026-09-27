'use strict';

const { DatabaseSync } = require('node:sqlite');

const NOW = "(strftime('%Y-%m-%dT%H:%M:%SZ','now'))";

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_salt   TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);

-- A partnership is a closed accountability circle. MVP caps it at 2 (1-on-1);
-- max_members is the lever for groups later.
CREATE TABLE IF NOT EXISTS partnerships (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,
  stakes       TEXT NOT NULL DEFAULT '',
  max_members  INTEGER NOT NULL DEFAULT 2,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_day  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS memberships (
  partnership_id      INTEGER NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_event_id  INTEGER NOT NULL DEFAULT 0,
  joined_at           TEXT NOT NULL DEFAULT ${NOW},
  PRIMARY KEY (partnership_id, user_id)
);

-- A shared goal: one person proposes, the other agrees. Once active, every
-- member gets their own habit row pointing at it (habits.goal_id), so
-- check-ins and scoring work exactly like personal habits.
CREATE TABLE IF NOT EXISTS goals (
  id               INTEGER PRIMARY KEY,
  partnership_id   INTEGER NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  proposed_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  why              TEXT NOT NULL DEFAULT '',
  icon             TEXT NOT NULL DEFAULT 'check',
  target_per_week  INTEGER NOT NULL CHECK (target_per_week BETWEEN 1 AND 7),
  schedule         TEXT NOT NULL DEFAULT '',
  daily_amount     REAL NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT '',
  step             REAL NOT NULL DEFAULT 0,
  amount_period    TEXT NOT NULL DEFAULT 'day',
  -- 1: agreed as a habit, but each partner sets their own number
  -- (protein, calories). The title and daily_amount then live per habit.
  personal         INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed', 'active', 'declined', 'withdrawn', 'ended')),
  created_at       TEXT NOT NULL DEFAULT ${NOW},
  decided_at       TEXT
);
CREATE INDEX IF NOT EXISTS goals_by_partnership ON goals(partnership_id);

CREATE TABLE IF NOT EXISTS habits (
  id               INTEGER PRIMARY KEY,
  partnership_id   INTEGER NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  why              TEXT NOT NULL DEFAULT '',
  target_per_week  INTEGER NOT NULL CHECK (target_per_week BETWEEN 1 AND 7),
  icon             TEXT NOT NULL DEFAULT 'check',
  schedule         TEXT NOT NULL DEFAULT '',   -- JSON {"mon":"05:30",...}; '' = any days
  -- Log-as-you-go goals (run 3 mi, 150 g protein): the daily amount that
  -- counts as done, its unit, and what one tap of the + button adds.
  daily_amount     REAL NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT '',
  step             REAL NOT NULL DEFAULT 0,
  -- 'day': daily_amount each day (150 g protein). 'week': daily_amount is a
  -- weekly total (15 mi a week); crossing it writes one Done for the week.
  amount_period    TEXT NOT NULL DEFAULT 'day',
  goal_id          INTEGER REFERENCES goals(id) ON DELETE CASCADE,
  created_day      TEXT NOT NULL,
  archived_day     TEXT,
  created_at       TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS habits_by_partnership ON habits(partnership_id);

CREATE TABLE IF NOT EXISTS checkins (
  id          INTEGER PRIMARY KEY,
  habit_id    INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('done', 'missed')),
  note        TEXT NOT NULL DEFAULT '',
  late        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (habit_id, day)
);

-- Running totals for log-as-you-go goals. Reaching daily_amount writes a
-- 'done' check-in, so scoring and streaks don't need to know about amounts.
CREATE TABLE IF NOT EXISTS amounts (
  habit_id  INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day       TEXT NOT NULL,
  amount    REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (habit_id, day)
);

-- The shared feed: check-ins, nudges, cheers, and anything a partner should see.
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY,
  partnership_id  INTEGER NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  actor_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  habit_id        INTEGER REFERENCES habits(id) ON DELETE CASCADE,
  checkin_id      INTEGER REFERENCES checkins(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  message         TEXT NOT NULL DEFAULT '',
  day             TEXT,
  created_at      TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS events_by_partnership ON events(partnership_id, id);
`;

// Additive migrations for databases created by older versions.
function migrate(db) {
  const habitCols = db.prepare('PRAGMA table_info(habits)').all().map((c) => c.name);
  if (!habitCols.includes('icon')) db.exec("ALTER TABLE habits ADD COLUMN icon TEXT NOT NULL DEFAULT 'check'");
  if (!habitCols.includes('goal_id')) db.exec('ALTER TABLE habits ADD COLUMN goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE');
  if (!habitCols.includes('schedule')) db.exec("ALTER TABLE habits ADD COLUMN schedule TEXT NOT NULL DEFAULT ''");
  const goalCols = db.prepare('PRAGMA table_info(goals)').all().map((c) => c.name);
  if (!goalCols.includes('schedule')) db.exec("ALTER TABLE goals ADD COLUMN schedule TEXT NOT NULL DEFAULT ''");
  if (!goalCols.includes('personal')) db.exec('ALTER TABLE goals ADD COLUMN personal INTEGER NOT NULL DEFAULT 0');
  for (const [table, cols] of [['habits', habitCols], ['goals', goalCols]]) {
    if (!cols.includes('daily_amount')) db.exec(`ALTER TABLE ${table} ADD COLUMN daily_amount REAL NOT NULL DEFAULT 0`);
    if (!cols.includes('unit')) db.exec(`ALTER TABLE ${table} ADD COLUMN unit TEXT NOT NULL DEFAULT ''`);
    if (!cols.includes('step')) db.exec(`ALTER TABLE ${table} ADD COLUMN step REAL NOT NULL DEFAULT 0`);
    if (!cols.includes('amount_period')) db.exec(`ALTER TABLE ${table} ADD COLUMN amount_period TEXT NOT NULL DEFAULT 'day'`);
  }
}

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

module.exports = { openDb };
