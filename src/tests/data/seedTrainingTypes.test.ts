import { runMigrations } from '../../data/migrations';
import { SEED_EXAMPLES_CLEARED_KEY, SEED_ROUTINES, clearSeededExamples, repairSeededRoutines, runSeeds } from '../../data/seeds';
import { FakeClock } from '../../services/clock';
import { createSequentialIdGenerator } from '../../shared/utils/id';
import { createNodeSqlDatabase, type NodeSqlDatabase } from '../support/nodeSqlDatabase';

/**
 * TASK-021-B1 (HD-5=B): the nine shipped routines carry hand-assigned
 * training types. The reference mapping below mirrors the approved table in
 * PRODUCT_PLAN_V1.3 verbatim; the test asserts each seed definition equals it
 * row by row — including "5分钟快速热身" = WARMUP (a name-based guess would
 * have said STRETCH_RELAX).
 *
 * The mapping is identity-based (written into the definitions), never inferred
 * from names or category tags at runtime.
 */

const EXPECTED_SEED_ROUTINE_TYPES: readonly (readonly [name: string, typeId: string])[] = [
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

function setup(): { db: NodeSqlDatabase; clock: FakeClock } {
  return {
    db: createNodeSqlDatabase(),
    clock: new FakeClock(Date.parse('2026-09-27T00:00:00.000Z')),
  };
}

async function routineTypesByName(db: NodeSqlDatabase): Promise<Map<string, string | null>> {
  const rows = await db.all<{ name: string; training_type_id: string | null }>(
    'SELECT name, training_type_id FROM routines',
  );
  return new Map(rows.map((row) => [row.name, row.training_type_id]));
}

describe('seed training types (TASK-021-B1, HD-5)', () => {
  it('each seed definition equals the approved mapping, row by row', () => {
    expect(SEED_ROUTINES).toHaveLength(9);
    for (const [name, typeId] of EXPECTED_SEED_ROUTINE_TYPES) {
      const definition = SEED_ROUTINES.find((candidate) => candidate.name === name);
      expect(definition).toBeDefined();
      expect(definition?.trainingTypeId).toBe(typeId);
    }
    // And nothing extra: every definition is covered by the mapping.
    expect(SEED_ROUTINES.map((definition) => definition.name).sort()).toEqual(
      EXPECTED_SEED_ROUTINE_TYPES.map(([name]) => name).sort(),
    );
  });

  it('seeds the nine routines with their types on a fresh install', async () => {
    const { db, clock } = setup();
    await runMigrations(db);

    const outcome = await runSeeds({
      db,
      clock,
      generateId: createSequentialIdGenerator(),
    });
    expect(outcome).toBe('seeded');

    const types = await routineTypesByName(db);
    for (const [name, typeId] of EXPECTED_SEED_ROUTINE_TYPES) {
      expect(types.get(name)).toBe(typeId);
    }
    // All referenced ids exist in training_types (no dangling snapshots).
    const known = await db.all<{ type_id: string }>('SELECT type_id FROM training_types');
    const knownIds = new Set(known.map((row) => row.type_id));
    for (const [, typeId] of EXPECTED_SEED_ROUTINE_TYPES) {
      expect(knownIds.has(typeId)).toBe(true);
    }

    db.close();
  });

  it('re-created (repaired) seed routines come back with their types', async () => {
    const { db, clock } = setup();
    await runMigrations(db);
    await runSeeds({ db, clock, generateId: createSequentialIdGenerator() });

    await db.run("DELETE FROM routines WHERE name = '5分钟快速热身'");
    const repair = await repairSeededRoutines({
      db,
      clock,
      generateId: createSequentialIdGenerator(),
    });
    expect(repair.outcome).toBe('repaired');
    expect(repair.restoredRoutineNames).toEqual(['5分钟快速热身']);

    const restored = await db.get<{ training_type_id: string | null }>(
      'SELECT training_type_id FROM routines WHERE name = ?',
      ['5分钟快速热身'],
    );
    expect(restored?.training_type_id).toBe('WARMUP');

    db.close();
  });

  it('never types rows it did not create (pre-existing and user routines stay unclassified)', async () => {
    const { db, clock } = setup();
    await runMigrations(db);

    // An upgraded install: user data present, so seeding backs off entirely.
    await db.run(
      `INSERT INTO routines (id, name, default_duration_sec, default_transition_sec, created_at, updated_at)
       VALUES ('user-1', '晨起全身拉伸', 30, 5, 'now', 'now')`,
    );
    await db.run(
      `INSERT INTO routines (id, name, default_duration_sec, default_transition_sec, created_at, updated_at)
       VALUES ('user-2', '我的自建流程', 30, 5, 'now', 'now')`,
    );

    expect(
      await runSeeds({ db, clock, generateId: createSequentialIdGenerator() }),
    ).toBe('skipped-user-data');
    expect(
      (
        await repairSeededRoutines({ db, clock, generateId: createSequentialIdGenerator() })
      ).outcome,
    ).toBe('not-applicable');

    const types = await routineTypesByName(db);
    expect(types.get('晨起全身拉伸')).toBeNull();
    expect(types.get('我的自建流程')).toBeNull();

    db.close();
  });

  it('respects seed_examples_cleared: cleared examples never come back with types', async () => {
    const { db, clock } = setup();
    await runMigrations(db);
    await runSeeds({ db, clock, generateId: createSequentialIdGenerator() });

    await clearSeededExamples({ db, clock, generateId: createSequentialIdGenerator() });
    expect(
      (
        await repairSeededRoutines({ db, clock, generateId: createSequentialIdGenerator() })
      ).outcome,
    ).toBe('skipped-cleared');
    // The one-shot seed marker is still set, so re-seeding reports
    // already-seeded (and does not resurrect anything either way).
    expect(
      await runSeeds({ db, clock, generateId: createSequentialIdGenerator() }),
    ).toBe('already-seeded');

    const marker = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [SEED_EXAMPLES_CLEARED_KEY],
    );
    expect(marker?.value).toBe('true');
    expect(
      (await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM routines'))?.total,
    ).toBe(0);

    db.close();
  });
});
