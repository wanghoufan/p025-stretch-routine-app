import { MIGRATIONS, latestSchemaVersion, runMigrations } from '../../data/migrations';
import { createNodeSqlDatabase } from '../support/nodeSqlDatabase';

/**
 * TASK-012: the V2 -> V3 migration is purely additive. It must add the
 * category/difficulty/bodypart columns to `actions` and `routines` without
 * touching a single existing row.
 */
describe('action/routine tag migration (TASK-012)', () => {
  async function createDatabaseAtVersion(target: number) {
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

  it('adds tag columns and keeps every existing row on V2 -> V3', async () => {
    const db = await createDatabaseAtVersion(2);

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

    // Rows survive untouched and simply read back as untagged (NULL).
    const action = await db.get<{
      name: string;
      category: string | null;
      difficulty: string | null;
      bodypart: string | null;
    }>('SELECT * FROM actions WHERE id = ?', ['a1']);
    expect(action?.name).toBe('用户动作');
    expect(action?.category).toBeNull();
    expect(action?.difficulty).toBeNull();
    expect(action?.bodypart).toBeNull();

    const routine = await db.get<{ name: string; category: string | null }>(
      'SELECT * FROM routines WHERE id = ?',
      ['r1'],
    );
    expect(routine?.name).toBe('用户流程');
    expect(routine?.category).toBeNull();

    expect(
      (await db.get<{ display_name: string }>('SELECT display_name FROM routine_steps WHERE id = ?', [
        's1',
      ]))?.display_name,
    ).toBe('步骤一');
    expect(
      (await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'seed_version'"))?.value,
    ).toBe('1');

    // Both user-owned tables really do have the three new columns.
    for (const table of ['actions', 'routines']) {
      const columns = (await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map(
        (column) => column.name,
      );
      expect(columns).toEqual(expect.arrayContaining(['category', 'difficulty', 'bodypart']));
    }

    db.close();
  });

  it('is a no-op when every migration already ran', async () => {
    const db = await createDatabaseAtVersion(2);
    await runMigrations(db);
    const again = await runMigrations(db);
    expect(again).toBe(latestSchemaVersion());
    db.close();
  });
});
