import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import type {
  CommandRecord,
  HookEvent,
  SessionRecord,
  SessionState,
  SupervisorHeartbeat,
} from "@ai-dashboard/shared";

export type DB = ReturnType<typeof openDb>;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  machine TEXT NOT NULL,
  project TEXT,
  branch TEXT,
  state TEXT NOT NULL DEFAULT 'idle',
  current_tool TEXT,
  current_prompt TEXT,
  active_subagents INTEGER NOT NULL DEFAULT 0,
  ram_mb INTEGER,
  queue_position INTEGER,
  last_activity_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_machine ON sessions(machine);
CREATE INDEX IF NOT EXISTS sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS sessions_last_activity ON sessions(last_activity_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_session_at ON events(session_id, at DESC);
CREATE INDEX IF NOT EXISTS events_at ON events(at DESC);

CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  machine TEXT,
  command TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS commands_pending ON commands(machine, consumed_at);

CREATE TABLE IF NOT EXISTS heartbeats (
  machine TEXT PRIMARY KEY,
  ram_total_mb INTEGER,
  ram_available_mb INTEGER,
  cpu_percent REAL,
  active_sessions INTEGER,
  queue_depth INTEGER,
  at INTEGER NOT NULL
);
`;

export function openDb(path: string): Database.Database {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("cache_size = -20000");
  db.exec(SCHEMA_SQL);
  return db;
}

export interface DbStatements {
  upsertSession: Database.Statement;
  updateSessionState: Database.Statement;
  setSessionTool: Database.Statement;
  setSessionPrompt: Database.Statement;
  incSubagents: Database.Statement;
  decSubagents: Database.Statement;
  insertEvent: Database.Statement;
  listSessions: Database.Statement;
  getSession: Database.Statement;
  recentEventsForSession: Database.Statement;
  pruneEvents: Database.Statement;
  upsertHeartbeat: Database.Statement;
  getHeartbeat: Database.Statement;
  insertCommand: Database.Statement;
  pendingCommandsForMachine: Database.Statement;
  consumeCommand: Database.Statement;
  countActive: Database.Statement;
}

export function prepareStatements(db: Database.Database): DbStatements {
  return {
    upsertSession: db.prepare(`
      INSERT INTO sessions (id, machine, project, branch, state, last_activity_at, created_at)
      VALUES (@id, @machine, @project, @branch, @state, @at, @at)
      ON CONFLICT(id) DO UPDATE SET
        machine = excluded.machine,
        project = COALESCE(excluded.project, sessions.project),
        branch = COALESCE(excluded.branch, sessions.branch),
        state = excluded.state,
        last_activity_at = excluded.last_activity_at
    `),
    updateSessionState: db.prepare(`
      UPDATE sessions
      SET state = @state, last_activity_at = @at, queue_position = @queue_position
      WHERE id = @id
    `),
    setSessionTool: db.prepare(`
      UPDATE sessions SET current_tool = @tool, last_activity_at = @at WHERE id = @id
    `),
    setSessionPrompt: db.prepare(`
      UPDATE sessions SET current_prompt = @prompt, last_activity_at = @at WHERE id = @id
    `),
    incSubagents: db.prepare(`UPDATE sessions SET active_subagents = active_subagents + 1 WHERE id = ?`),
    decSubagents: db.prepare(`
      UPDATE sessions SET active_subagents = MAX(0, active_subagents - 1) WHERE id = ?
    `),
    insertEvent: db.prepare(`
      INSERT INTO events (session_id, type, payload, at) VALUES (@session_id, @type, @payload, @at)
    `),
    listSessions: db.prepare(`
      SELECT * FROM sessions ORDER BY last_activity_at DESC LIMIT 200
    `),
    getSession: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
    recentEventsForSession: db.prepare(`
      SELECT * FROM events WHERE session_id = ? ORDER BY at DESC LIMIT ?
    `),
    pruneEvents: db.prepare(`DELETE FROM events WHERE at < ?`),
    upsertHeartbeat: db.prepare(`
      INSERT INTO heartbeats (machine, ram_total_mb, ram_available_mb, cpu_percent, active_sessions, queue_depth, at)
      VALUES (@machine, @ram_total_mb, @ram_available_mb, @cpu_percent, @active_sessions, @queue_depth, @at)
      ON CONFLICT(machine) DO UPDATE SET
        ram_total_mb = excluded.ram_total_mb,
        ram_available_mb = excluded.ram_available_mb,
        cpu_percent = excluded.cpu_percent,
        active_sessions = excluded.active_sessions,
        queue_depth = excluded.queue_depth,
        at = excluded.at
    `),
    getHeartbeat: db.prepare(`SELECT * FROM heartbeats WHERE machine = ?`),
    insertCommand: db.prepare(`
      INSERT INTO commands (session_id, machine, command, payload, created_at)
      VALUES (@session_id, @machine, @command, @payload, @created_at)
    `),
    pendingCommandsForMachine: db.prepare(`
      SELECT * FROM commands
      WHERE consumed_at IS NULL AND (machine = ? OR machine IS NULL)
      ORDER BY created_at ASC
      LIMIT 50
    `),
    consumeCommand: db.prepare(`UPDATE commands SET consumed_at = ? WHERE id = ?`),
    countActive: db.prepare(`
      SELECT COUNT(*) AS n FROM sessions WHERE state IN ('working','waiting-permission','waiting-input','queued')
    `),
  };
}

export interface SessionRow {
  id: string;
  machine: string;
  project: string | null;
  branch: string | null;
  state: SessionState;
  current_tool: string | null;
  current_prompt: string | null;
  active_subagents: number;
  ram_mb: number | null;
  queue_position: number | null;
  last_activity_at: number;
  created_at: number;
}

export function rowToSession(r: SessionRow): SessionRecord {
  return r;
}
