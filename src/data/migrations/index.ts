import type { SqlDatabase } from '../db/Database';

/**
 * Versioned schema migrations (Constitution XI, PLAN §10).
 *
 * Each migration is applied once and recorded in SQLite's `user_version`
 * pragma. Production upgrades never rely on dropping the database.
 */

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const INITIAL_SCHEMA_VERSION = 1;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        default_duration_sec INTEGER NOT NULL,
        side_mode TEXT NOT NULL,
        default_speak_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        default_duration_sec INTEGER NOT NULL,
        default_transition_sec INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS routine_steps (
        id TEXT PRIMARY KEY NOT NULL,
        routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
        source_action_id TEXT,
        order_index INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        speak_text TEXT NOT NULL,
        duration_sec INTEGER NOT NULL,
        transition_sec INTEGER NOT NULL,
        pair_group_id TEXT,
        side TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_routine_steps_routine
        ON routine_steps (routine_id, order_index)`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS active_session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_id TEXT NOT NULL,
        routine_id TEXT NOT NULL,
        state TEXT NOT NULL,
        current_step_index INTEGER NOT NULL,
        phase_started_at_epoch_ms INTEGER,
        paused_at_epoch_ms INTEGER,
        accumulated_pause_ms INTEGER NOT NULL,
        effective_step_duration_ms INTEGER NOT NULL,
        effective_transition_duration_ms INTEGER NOT NULL,
        runtime_extension_ms INTEGER NOT NULL,
        completed_phase_ms INTEGER NOT NULL,
        updated_at_epoch_ms INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: 'active_session_v2_monotonic_snapshot',
    /**
     * R010: rebuild ONLY the transient `active_session` table.
     *
     * `active_session` is disposable runtime state: V1 rows carry wall-clock
     * epochs that V2 deliberately stops trusting, and there is no way to
     * translate them into the new monotonic origin (`bootCount`/elapsed ms).
     * Dropping and recreating it therefore loses nothing the user owns.
     *
     * User-owned tables — `actions`, `routines`, `routine_steps`,
     * `app_settings` — are NOT touched by this migration.
     */
    statements: [
      'DROP TABLE IF EXISTS active_session',
      `CREATE TABLE active_session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_id TEXT NOT NULL,
        routine_id TEXT NOT NULL,
        routine_name TEXT NOT NULL,
        state TEXT NOT NULL,
        current_step_index INTEGER NOT NULL,
        phase_started_elapsed_ms INTEGER,
        paused_at_elapsed_ms INTEGER,
        accumulated_pause_ms INTEGER NOT NULL,
        effective_step_duration_ms INTEGER NOT NULL,
        effective_transition_duration_ms INTEGER NOT NULL,
        runtime_extension_ms INTEGER NOT NULL,
        completed_phase_ms INTEGER NOT NULL,
        last_updated_elapsed_ms INTEGER NOT NULL,
        updated_at_wall_ms INTEGER NOT NULL,
        boot_count INTEGER NOT NULL,
        snapshot_version INTEGER NOT NULL,
        snapshot TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 3,
    name: 'action_routine_tags',
    /**
     * TASK-012: tag Actions and Routines with 场景 / 难度 / 部位.
     *
     * Purely additive: `ALTER TABLE ... ADD COLUMN` never rewrites a row, so
     * every existing Action/Routine/Step keeps its data. The tag columns are
     * nullable TEXT; multi-value fields use comma-separated values.
     */
    statements: [
      'ALTER TABLE actions ADD COLUMN category TEXT',
      'ALTER TABLE actions ADD COLUMN difficulty TEXT',
      'ALTER TABLE actions ADD COLUMN bodypart TEXT',
      'ALTER TABLE routines ADD COLUMN category TEXT',
      'ALTER TABLE routines ADD COLUMN difficulty TEXT',
      'ALTER TABLE routines ADD COLUMN bodypart TEXT',
    ],
  },
  {
    version: 4,
    name: 'history_stats',
    /**
     * TASK-021-B1: training-type system + session history archive.
     *
     * Purely additive (like V2 -> V3): existing rows keep every value and all
     * new columns are nullable or carry defaults, so a V3 database upgrades in
     * place and an in-flight session stays resumable (it decodes as
     * unclassified / stats-ineligible and is never back-filled).
     *
     * - `training_types` is the single source of the classification axis; new
     *   categories are future additive migrations inserting rows, never code
     *   changes (HD-1/HD-5: no closed three-value enum in code).
     * - `routines.training_type_id` is ONE nullable scalar (NULL = 未分类).
     * - `active_session` gains the frozen type plus the stats ledger scalars.
     *   The per-step ledger is numbers only (no playback content), so the
     *   snapshot stays the single step source of truth.
     * - `session_history` / `session_history_steps` archive one row per
     *   finished session / per actually-run step; `session_id` is the
     *   idempotency key. Only the date index is created — "recent N" sorts by
     *   (ended_at_wall_ms DESC, session_id DESC) and the per-step primary key
     *   already covers per-session lookups.
     * - `stats_anomaly_notice` carries durable "anomalous loss" notifications
     *   (expected exclusions never write here).
     */
    statements: [
      `CREATE TABLE IF NOT EXISTS training_types (
        type_id TEXT PRIMARY KEY NOT NULL,
        name_zh TEXT NOT NULL,
        name_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 1 CHECK (is_builtin IN (0, 1)),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
      )`,
      `INSERT OR IGNORE INTO training_types (type_id, name_zh, name_en, sort_order) VALUES
        ('STRETCH_RELAX', '拉伸放松', 'Stretch & Relax', 1),
        ('WARMUP', '热身', 'Warm-up', 2),
        ('CORE', '核心训练', 'Core Training', 3)`,
      'ALTER TABLE routines ADD COLUMN training_type_id TEXT REFERENCES training_types (type_id)',
      'ALTER TABLE active_session ADD COLUMN training_type_id TEXT REFERENCES training_types (type_id)',
      'ALTER TABLE active_session ADD COLUMN stats_eligible INTEGER NOT NULL DEFAULT 0 CHECK (stats_eligible IN (0, 1))',
      'ALTER TABLE active_session ADD COLUMN stats_total_step_ms INTEGER NOT NULL DEFAULT 0 CHECK (stats_total_step_ms >= 0)',
      "ALTER TABLE active_session ADD COLUMN stats_step_ledger_json TEXT NOT NULL DEFAULT '{}'",
      `CREATE TABLE IF NOT EXISTS session_history (
        session_id TEXT PRIMARY KEY NOT NULL,
        routine_id TEXT NOT NULL,
        routine_name TEXT NOT NULL,
        training_type_id TEXT REFERENCES training_types (type_id),
        started_at_wall_ms INTEGER NOT NULL,
        ended_at_wall_ms INTEGER NOT NULL,
        end_local_date TEXT NOT NULL,
        end_utc_offset_min INTEGER NOT NULL,
        total_step_ms INTEGER NOT NULL CHECK (total_step_ms >= 0),
        end_state TEXT NOT NULL CHECK (end_state IN ('COMPLETED', 'STOPPED')),
        ended_early INTEGER NOT NULL CHECK (ended_early IN (0, 1)),
        archived_at_wall_ms INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_session_history_date
        ON session_history (end_local_date, ended_at_wall_ms DESC)`,
      `CREATE TABLE IF NOT EXISTS session_history_steps (
        session_id TEXT NOT NULL REFERENCES session_history (session_id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL,
        step_id TEXT,
        step_name TEXT NOT NULL,
        training_type_id TEXT REFERENCES training_types (type_id),
        effective_ms INTEGER NOT NULL CHECK (effective_ms >= 0),
        PRIMARY KEY (session_id, step_index)
      )`,
      `CREATE TABLE IF NOT EXISTS stats_anomaly_notice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reason_code TEXT NOT NULL,
        occurred_at_wall_ms INTEGER NOT NULL,
        session_id TEXT,
        dismissed_at_wall_ms INTEGER
      )`,
    ],
  },
];

/** Highest schema version this build knows how to produce. */
export function latestSchemaVersion(): number {
  return MIGRATIONS.reduce((max, migration) => Math.max(max, migration.version), 0);
}

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Apply every migration newer than the stored schema version. Safe to call on
 * every launch: already-applied migrations are skipped.
 */
export async function runMigrations(db: SqlDatabase): Promise<number> {
  // SQLite ignores this pragma inside a transaction, so it must be issued first
  // and on its own. Older Android SQLite builds default it to OFF.
  await db.exec('PRAGMA foreign_keys = ON');

  let current = await getSchemaVersion(db);

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) {
      continue;
    }
    await db.transaction(async () => {
      for (const statement of migration.statements) {
        await db.exec(statement);
      }
      // PRAGMA cannot be parameterised; the value is a validated integer literal.
      await db.exec(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
    });
    current = migration.version;
  }

  return current;
}

/** Test/qa helper: drop everything and start from an empty database. */
export async function resetSchema(db: SqlDatabase): Promise<void> {
  // session_history_steps first: it references session_history (and through it
  // training_types), so children go before parents regardless of FK pragma.
  const tables = [
    'session_history_steps',
    'session_history',
    'stats_anomaly_notice',
    'routine_steps',
    'routines',
    'actions',
    'app_settings',
    'active_session',
    'training_types',
  ];
  for (const table of tables) {
    await db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  await db.exec('PRAGMA user_version = 0');
}
