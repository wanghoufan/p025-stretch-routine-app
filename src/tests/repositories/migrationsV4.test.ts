import {
  MIGRATIONS,
  latestSchemaVersion,
  resetSchema,
  runMigrations,
  getSchemaVersion,
} from '../../data/migrations';
import { createNodeSqlDatabase, type NodeSqlDatabase } from '../support/nodeSqlDatabase';

/**
 * TASK-021-B1: the V4 history/stats migration is purely additive. Existing
 * rows survive untouched, the built-in training types are seeded, and the
 * version pragma is idempotent.
 */

async function createDatabaseAtVersion(target: number): Promise<NodeSqlDatabase> {
  const db = createNodeSqlDatabase();
  await db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS.filter((candidate) => candidate.version <= target)) {
    for (const statement of migration.statements) {
      await db.exec(statement);
    }
    await db.exec(`PRAGMA user_version = ${migration.version}`);
  }
  return db;
}

describe('history/stats migration V4 (TASK-021-B1)', () => {
  it('keeps every user-owned row when upgrading V1 -> V4', async () => {
    const db = await createDatabaseAtVersion(1);

    await db.run(
      `INSERT INTO actions (id, name, default_duration_sec, side_mode, default_speak_text, created_at, updated_at)
       VALUES ('a1', '用户动作', 30, 'single', '用户动作', 'now', 'now')`,
    );
    await db.run(
      `INSERT INTO routines (id, name, default_duration_sec, default_transition_sec, created_at, updated_at)
       VALUES ('r1', '用户流程', 30, 5, 'now', 'now')`,
    );
    await db.run(
      `INSERT INTO routine_steps
         (id, routine_id, source_action_id, order_index, display_name, speak_text, duration_sec, transition_sec, pair_group_id, side)
       VALUES ('s1', 'r1', 'a1', 0, '步骤一', '步骤一', 30, 5, NULL, 'none')`,
    );
    await db.run("INSERT INTO app_settings (key, value) VALUES ('seed_version', '1')");

    const version = await runMigrations(db);
    expect(version).toBe(latestSchemaVersion());

    expect(
      (await db.get<{ name: string }>('SELECT name FROM actions WHERE id = ?', ['a1']))?.name,
    ).toBe('用户动作');
    expect(
      (await db.get<{ name: string }>('SELECT name FROM routines WHERE id = ?', ['r1']))?.name,
    ).toBe('用户流程');
    expect(
      (await db.get<{ display_name: string }>(
        'SELECT display_name FROM routine_steps WHERE id = ?',
        ['s1'],
      ))?.display_name,
    ).toBe('步骤一');
    expect(
      (await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'seed_version'"))
        ?.value,
    ).toBe('1');
    // Pre-V4 routines are unclassified (never guessed).
    expect(
      (await db.get<{ training_type_id: string | null }>(
        'SELECT training_type_id FROM routines WHERE id = ?',
        ['r1'],
      ))?.training_type_id,
    ).toBeNull();

    db.close();
  });

  it('upgrades V3 -> V4 preserving data and adds the new columns and tables', async () => {
    const db = await createDatabaseAtVersion(3);

    await db.run(
      `INSERT INTO actions (id, name, default_duration_sec, side_mode, default_speak_text, created_at, updated_at)
       VALUES ('a1', '用户动作', 30, 'single', '用户动作', 'now', 'now')`,
    );
    await db.run(
      `INSERT INTO routines (id, name, default_duration_sec, default_transition_sec, category, created_at, updated_at)
       VALUES ('r1', '用户流程', 30, 5, '办公', 'now', 'now')`,
    );
    await db.run(
      `INSERT INTO routine_steps
         (id, routine_id, source_action_id, order_index, display_name, speak_text, duration_sec, transition_sec, pair_group_id, side)
       VALUES ('s1', 'r1', 'a1', 0, '步骤一', '步骤一', 30, 5, NULL, 'none')`,
    );
    await db.run("INSERT INTO app_settings (key, value) VALUES ('seed_version', '1')");
    await db.run(
      `INSERT INTO active_session
         (id, session_id, routine_id, routine_name, state, current_step_index,
          phase_started_elapsed_ms, paused_at_elapsed_ms, accumulated_pause_ms,
          effective_step_duration_ms, effective_transition_duration_ms, runtime_extension_ms,
          completed_phase_ms, last_updated_elapsed_ms, updated_at_wall_ms, boot_count,
          snapshot_version, snapshot)
       VALUES (1, 'live', 'r1', '用户流程', 'PAUSED_STEP', 0, 1000, 2000, 0, 30000, 5000, 0, 0, 1000, 1000, 7, 1, '{}')`,
    );

    const version = await runMigrations(db);
    expect(version).toBe(latestSchemaVersion());

    // User data untouched, tags intact, type still unclassified.
    const routine = await db.get<{
      name: string;
      category: string | null;
      training_type_id: string | null;
    }>('SELECT * FROM routines WHERE id = ?', ['r1']);
    expect(routine?.name).toBe('用户流程');
    expect(routine?.category).toBe('办公');
    expect(routine?.training_type_id).toBeNull();

    // The in-flight session survives and decodes as pre-stats (ineligible,
    // unclassified) — it stays resumable and is never back-filled.
    const session = await db.get<{
      session_id: string;
      training_type_id: string | null;
      stats_eligible: number;
      stats_total_step_ms: number;
      stats_step_ledger_json: string;
    }>('SELECT * FROM active_session WHERE id = 1');
    expect(session?.session_id).toBe('live');
    expect(session?.training_type_id).toBeNull();
    expect(session?.stats_eligible).toBe(0);
    expect(session?.stats_total_step_ms).toBe(0);
    expect(session?.stats_step_ledger_json).toBe('{}');

    // Built-in types are seeded by the migration itself; history stays empty.
    expect(
      (await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM training_types'))?.total,
    ).toBe(3);
    for (const table of ['session_history', 'session_history_steps', 'stats_anomaly_notice']) {
      expect(
        (await db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`))?.total,
      ).toBe(0);
    }
    const historyColumns = (await db.all<{ name: string }>('PRAGMA table_info(session_history)')).map(
      (column) => column.name,
    );
    expect(historyColumns).toEqual(
      expect.arrayContaining([
        'session_id',
        'routine_name',
        'training_type_id',
        'started_at_wall_ms',
        'ended_at_wall_ms',
        'end_local_date',
        'end_utc_offset_min',
        'total_step_ms',
        'end_state',
        'ended_early',
      ]),
    );

    db.close();
  });

  it('seeds exactly the three built-in training types', async () => {
    const db = await createDatabaseAtVersion(3);
    await runMigrations(db);

    const types = await db.all<{
      type_id: string;
      name_zh: string;
      name_en: string;
      sort_order: number;
      is_builtin: number;
    }>('SELECT * FROM training_types ORDER BY sort_order ASC');
    expect(types.map((row) => row.type_id)).toEqual(['STRETCH_RELAX', 'WARMUP', 'CORE']);
    expect(types.map((row) => row.name_zh)).toEqual(['拉伸放松', '热身', '核心训练']);
    expect(types.every((row) => row.is_builtin === 1)).toBe(true);

    db.close();
  });

  it('is idempotent: running twice keeps version 4 and does not duplicate type rows', async () => {
    const db = await createDatabaseAtVersion(3);
    await runMigrations(db);
    const again = await runMigrations(db);

    expect(again).toBe(latestSchemaVersion());
    expect(again).toBe(4);
    expect(await getSchemaVersion(db)).toBe(4);
    expect(
      (await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM training_types'))?.total,
    ).toBe(3);

    db.close();
  });

  it('rejects history rows referencing an unknown training type (FK is on)', async () => {
    const db = await createDatabaseAtVersion(3);
    await runMigrations(db);

    await expect(
      db.run(
        `INSERT INTO session_history
           (session_id, routine_id, routine_name, training_type_id, started_at_wall_ms,
            ended_at_wall_ms, end_local_date, end_utc_offset_min, total_step_ms, end_state, ended_early, archived_at_wall_ms)
         VALUES ('s1', 'r1', 'n', 'NO_SUCH_TYPE', 1, 2, '2026-09-27', -480, 100, 'COMPLETED', 0, 2)`,
      ),
    ).rejects.toThrow();

    db.close();
  });

  it('resetSchema drops the new tables as well', async () => {
    const db = await createDatabaseAtVersion(3);
    await runMigrations(db);
    await resetSchema(db);

    expect(await getSchemaVersion(db)).toBe(0);
    for (const table of ['training_types', 'session_history', 'session_history_steps', 'stats_anomaly_notice']) {
      await expect(db.exec(`SELECT 1 FROM ${table}`)).rejects.toThrow();
    }

    // And the schema can be rebuilt from scratch.
    expect(await runMigrations(db)).toBe(latestSchemaVersion());
    db.close();
  });
});
