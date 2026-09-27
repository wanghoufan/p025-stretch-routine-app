import { MIGRATIONS, getSchemaVersion, latestSchemaVersion, runMigrations } from '../../data/migrations';
import { createNodeSqlDatabase } from '../support/nodeSqlDatabase';

/**
 * R010 / R013: the V1 -> V2 migration must rebuild ONLY the transient
 * `active_session` table and keep every user-owned row.
 */
describe('active_session V2 migration (R010, R013)', () => {
  async function createV1Database() {
    const db = createNodeSqlDatabase();
    await db.exec('PRAGMA foreign_keys = ON');
    const v1 = MIGRATIONS.find((migration) => migration.version === 1);
    if (!v1) {
      throw new Error('V1 migration missing');
    }
    for (const statement of v1.statements) {
      await db.exec(statement);
    }
    await db.exec('PRAGMA user_version = 1');
    return db;
  }

  async function seedUserData(db: ReturnType<typeof createNodeSqlDatabase>) {
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
  }

  it('keeps Actions/Routines/Steps/Settings and rebuilds only the session table', async () => {
    const db = await createV1Database();
    await seedUserData(db);
    // A leftover V1 session with wall-clock columns.
    await db.run(
      `INSERT INTO active_session
         (id, session_id, routine_id, state, current_step_index, phase_started_at_epoch_ms,
          paused_at_epoch_ms, accumulated_pause_ms, effective_step_duration_ms,
          effective_transition_duration_ms, runtime_extension_ms, completed_phase_ms, updated_at_epoch_ms)
       VALUES (1, 'old', 'r1', 'RUNNING_STEP', 0, 1000, NULL, 0, 30000, 0, 0, 0, 1000)`,
    );

    const version = await runMigrations(db);
    expect(version).toBe(latestSchemaVersion());

    // User-owned rows are untouched.
    expect((await db.get<{ name: string }>('SELECT name FROM actions WHERE id = ?', ['a1']))?.name).toBe(
      '用户动作',
    );
    expect((await db.get<{ name: string }>('SELECT name FROM routines WHERE id = ?', ['r1']))?.name).toBe(
      '用户流程',
    );
    expect(
      (await db.get<{ display_name: string }>('SELECT display_name FROM routine_steps WHERE id = ?', ['s1']))
        ?.display_name,
    ).toBe('步骤一');
    expect(
      (await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'seed_version'"))?.value,
    ).toBe('1');

    // The V1 session is intentionally dropped: its wall-clock origin cannot be
    // translated into the V2 monotonic origin.
    const rows = await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM active_session');
    expect(rows?.total).toBe(0);

    // ...and the table has the V2 columns.
    const columns = await db.all<{ name: string }>('PRAGMA table_info(active_session)');
    const names = columns.map((column) => column.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'routine_name',
        'phase_started_elapsed_ms',
        'paused_at_elapsed_ms',
        'last_updated_elapsed_ms',
        'updated_at_wall_ms',
        'boot_count',
        'snapshot_version',
        'snapshot',
      ]),
    );
    expect(names).not.toContain('phase_started_at_epoch_ms');

    db.close();
  });

  it('is idempotent on an already-migrated database', async () => {
    const db = await createV1Database();
    await seedUserData(db);

    await runMigrations(db);
    const again = await runMigrations(db);

    expect(again).toBe(latestSchemaVersion());
    expect(await getSchemaVersion(db)).toBe(latestSchemaVersion());
    expect((await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM routines'))?.total).toBe(1);
    db.close();
  });
});
