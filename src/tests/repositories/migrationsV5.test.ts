import {
  MIGRATIONS,
  SEED_TYPE_BACKFILL_V5,
  latestSchemaVersion,
  resetSchema,
  runMigrations,
  getSchemaVersion,
} from '../../data/migrations';
import { SEED_ROUTINES } from '../../data/seeds';
import { createNodeSqlDatabase, type NodeSqlDatabase } from '../support/nodeSqlDatabase';

/**
 * TASK-021-F1: the V5 seed training-type backfill (真机 QA 缺陷修复).
 *
 * 真机复现：升级到含统计的版本后，升级前就存在的 9 个种子流程全部落在
 * 「未分类」桶——`repairSeededRoutines` 只补插"缺失"的种子，存量行的
 * `training_type_id` 永远是 NULL。V5 按 PRODUCT_PLAN_V1.3 的固定映射表
 * 一次性回填：只填 NULL，绝不覆盖用户已设类型；历史归档（快照）不碰。
 */

const V13_MAPPING: readonly (readonly [name: string, typeId: string])[] = [
  ['晨起全身拉伸', 'STRETCH_RELAX'],
  ['久坐办公族拉伸', 'STRETCH_RELAX'],
  ['跑后下肢放松', 'STRETCH_RELAX'],
  ['办公室久坐放松', 'STRETCH_RELAX'],
  ['睡前全身放松', 'STRETCH_RELAX'],
  ['5分钟快速热身', 'WARMUP'],
  ['初级核心', 'CORE'],
  ['中级核心', 'CORE'],
  ['高级核心', 'CORE'],
];

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

async function typesByName(db: NodeSqlDatabase): Promise<Map<string, string | null>> {
  const rows = await db.all<{ name: string; training_type_id: string | null }>(
    'SELECT name, training_type_id FROM routines',
  );
  return new Map(rows.map((row) => [row.name, row.training_type_id]));
}

async function insertRoutine(
  db: NodeSqlDatabase,
  id: string,
  name: string,
  trainingTypeId: string | null,
): Promise<void> {
  await db.run(
    `INSERT INTO routines (id, name, default_duration_sec, default_transition_sec, training_type_id, created_at, updated_at)
     VALUES (?, ?, 30, 5, ?, 'now', 'now')`,
    [id, name, trainingTypeId],
  );
}

describe('seed training-type backfill migration V5 (TASK-021-F1)', () => {
  it('matches the V1.3 mapping and the seed definitions row by row (drift guard)', () => {
    const backfill = SEED_TYPE_BACKFILL_V5.flatMap(([typeId, names]) =>
      names.map((name): [string, string] => [name, typeId]),
    ).sort(([a], [b]) => a.localeCompare(b));
    expect(backfill).toEqual([...V13_MAPPING].sort(([a], [b]) => a.localeCompare(b)));

    // And the frozen mapping cannot drift from the seed definitions either.
    const fromSeeds = SEED_ROUTINES.map(
      (definition): [string, string] => [definition.name, definition.trainingTypeId],
    ).sort(([a], [b]) => a.localeCompare(b));
    expect(backfill).toEqual(fromSeeds);
  });

  it('types the nine pre-existing seed routines exactly per the V1.3 mapping (V4 -> V5)', async () => {
    const db = await createDatabaseAtVersion(4);
    for (const [index, [name, typeId]] of V13_MAPPING.entries()) {
      await insertRoutine(db, `r${index}`, name, null);
    }

    expect(await runMigrations(db)).toBe(5);

    const types = await typesByName(db);
    for (const [name, typeId] of V13_MAPPING) {
      expect(types.get(name)).toBe(typeId);
    }

    db.close();
  });

  it('never overwrites a type the user already set', async () => {
    const db = await createDatabaseAtVersion(4);
    // 晨起全身拉伸 is STRETCH_RELAX per the mapping; the user picked CORE.
    await insertRoutine(db, 'r-user-pick', '晨起全身拉伸', 'CORE');
    // And a fresh-install seed row (already typed) must survive unchanged.
    await insertRoutine(db, 'r-seed', '5分钟快速热身', 'WARMUP');

    await runMigrations(db);

    const types = await typesByName(db);
    expect(types.get('晨起全身拉伸')).toBe('CORE');
    expect(types.get('5分钟快速热身')).toBe('WARMUP');

    db.close();
  });

  it('does not type routines whose names are not in the seed catalog', async () => {
    const db = await createDatabaseAtVersion(4);
    await insertRoutine(db, 'r-custom', '我的自建流程', null);
    // Near-misses must not match either.
    await insertRoutine(db, 'r-typo', '晨起全身拉伸 ', null);
    await insertRoutine(db, 'r-prefix', '中级核心（复刻）', null);

    await runMigrations(db);

    const types = await typesByName(db);
    expect(types.get('我的自建流程')).toBeNull();
    expect(types.get('晨起全身拉伸 ')).toBeNull();
    expect(types.get('中级核心（复刻）')).toBeNull();

    db.close();
  });

  it('is idempotent: rerunning keeps version 5 and never re-types', async () => {
    const db = await createDatabaseAtVersion(4);
    await insertRoutine(db, 'r1', '晨起全身拉伸', null);
    await insertRoutine(db, 'r2', '5分钟快速热身', 'WARMUP');

    await runMigrations(db);
    // User clears their pick afterwards; a re-run must NOT re-fill it.
    await db.run("UPDATE routines SET training_type_id = NULL WHERE id = 'r2'");
    const again = await runMigrations(db);

    expect(again).toBe(5);
    expect(await getSchemaVersion(db)).toBe(5);
    const types = await typesByName(db);
    expect(types.get('晨起全身拉伸')).toBe('STRETCH_RELAX');
    expect(types.get('5分钟快速热身')).toBeNull();

    db.close();
  });

  it.each([1, 2, 3])('upgrades a V%d database straight to V5 with seed rows typed', async (from) => {
    const db = await createDatabaseAtVersion(from);
    // At V1/V2/V3 the routines table has no training_type_id column yet.
    await db.run(
      `INSERT INTO routines (id, name, default_duration_sec, default_transition_sec, created_at, updated_at)
       VALUES ('r1', '初级核心', 30, 5, 'now', 'now')`,
    );
    await db.run(
      `INSERT INTO routines (id, name, default_duration_sec, default_transition_sec, created_at, updated_at)
       VALUES ('r2', '5分钟快速热身', 30, 5, 'now', 'now')`,
    );

    expect(await runMigrations(db)).toBe(latestSchemaVersion());

    const types = await typesByName(db);
    expect(types.get('初级核心')).toBe('CORE');
    expect(types.get('5分钟快速热身')).toBe('WARMUP');

    db.close();
  });

  it('resetSchema drops everything and a fresh rebuild through V5 succeeds', async () => {
    const db = await createDatabaseAtVersion(4);
    await insertRoutine(db, 'r1', '高级核心', null);
    await runMigrations(db);

    await resetSchema(db);
    expect(await getSchemaVersion(db)).toBe(0);

    // The rebuild runs the V5 UPDATEs against empty tables (safe no-ops) and
    // lands on the latest version.
    expect(await runMigrations(db)).toBe(latestSchemaVersion());
    expect(await getSchemaVersion(db)).toBe(latestSchemaVersion());
    expect(
      (await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM routines'))?.total,
    ).toBe(0);

    db.close();
  });
});
