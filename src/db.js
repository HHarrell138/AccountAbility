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

CREATE TABLE IF NOT EXISTS habits (
  id               INTEGER PRIMARY KEY,
  partnership_id   INTEGER NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  why              TEXT NOT NULL DEFAULT '',
  target_per_week  INTEGER NOT NULL CHECK (target_per_week BETWEEN 1 AND 7),
  icon             TEXT NOT NULL DEFAULT 'check',
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
}

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

module.exports = { openDb };
