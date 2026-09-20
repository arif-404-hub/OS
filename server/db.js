// SQLite persistence using Node's built-in driver (no native deps required).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'data'), { recursive: true });

export const db = new DatabaseSync(join(root, 'data', 'engineeros.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'DEVELOPER',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'DEVELOPER',
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS requirements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'functional',   -- functional | non-functional
  category    TEXT NOT NULL DEFAULT 'Functional', -- Functional | Performance | Security | ...
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'medium',       -- high | medium | low
  story       TEXT NOT NULL DEFAULT '',             -- user story
  acceptance  TEXT NOT NULL DEFAULT '',             -- JSON array of criteria
  quality     INTEGER NOT NULL DEFAULT 0,           -- 0-100 quality score
  issues      TEXT NOT NULL DEFAULT '[]',           -- JSON array of ambiguity warnings
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sprints (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',        -- active | completed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id      INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
  requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'backlog',   -- backlog|todo|in_progress|review|done
  points         INTEGER NOT NULL DEFAULT 3,
  assignee_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bugs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  severity   TEXT NOT NULL DEFAULT 'medium',        -- critical|high|medium|low
  status     TEXT NOT NULL DEFAULT 'open',          -- open|in_progress|resolved
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Add new project context fields without rebuilding or losing existing data.
try { db.exec("ALTER TABLE projects ADD COLUMN project_type TEXT NOT NULL DEFAULT ''"); } catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}

/** Run a SELECT and return all rows. */
export const all = (sql, ...args) => db.prepare(sql).all(...args);
/** Run a SELECT and return the first row (or undefined). */
export const get = (sql, ...args) => db.prepare(sql).get(...args);
/** Run an INSERT/UPDATE/DELETE and return { changes, lastInsertRowid }. */
export const run = (sql, ...args) => db.prepare(sql).run(...args);

export function log(projectId, userId, message) {
  run('INSERT INTO activity (project_id, user_id, message) VALUES (?, ?, ?)', projectId, userId, message);
}
