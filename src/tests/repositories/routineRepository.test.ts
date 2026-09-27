import { createRoutineRepository } from '../../data/repositories/routineRepository';
import { FakeClock } from '../../services/clock';
import { runMigrations } from '../../data/migrations';
import { createSequentialIdGenerator } from '../../shared/utils/id';
import { createNodeSqlDatabase, type NodeSqlDatabase } from '../support/nodeSqlDatabase';

function setup() {
  const db: NodeSqlDatabase = createNodeSqlDatabase();
  const clock = new FakeClock(Date.parse('2026-09-17T00:00:00.000Z'));
  return { db, clock, routines: createRoutineRepository({ db, clock, generateId: createSequentialIdGenerator() }) };
}

describe('routine repository', () => {
  it('persists an ordered multi-step routine', async () => {
    const { db, routines } = setup();
    await runMigrations(db);

    const created = await routines.create({
      name: '肩颈放松',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      steps: [
        { displayName: 'A', durationSec: 30, transitionSec: 5 },
        { displayName: 'B', durationSec: 40, transitionSec: 0 },
        { displayName: 'C', durationSec: 20, transitionSec: 5 },
      ],
    });

    expect(created.steps.map((step) => step.displayName)).toEqual(['A', 'B', 'C']);
    expect(created.steps.map((step) => step.orderIndex)).toEqual([0, 1, 2]);
    // speakText defaults to the display name.
    expect(created.steps[1]?.speakText).toBe('B');
    db.close();
  });

  it('persists 场景/难度/部位 tags on a routine', async () => {
    const { db, routines } = setup();
    await runMigrations(db);

    const created = await routines.create({
      name: '晨间拉伸',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      category: ['晨起'],
      difficulty: '低',
      bodypart: ['全身', '背'],
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 5 }],
    });

    const loaded = await routines.getById(created.routine.id);
    expect(loaded?.category).toEqual(['晨起']);
    expect(loaded?.difficulty).toBe('低');
    expect(loaded?.bodypart).toEqual(['全身', '背']);

    const [summary] = await routines.listSummaries();
    expect(summary?.category).toEqual(['晨起']);
    expect(summary?.difficulty).toBe('低');

    const updated = await routines.update(created.routine.id, {
      name: '晨间拉伸',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      difficulty: '中',
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 5 }],
    });
    // A UI edit that knows nothing about tags must not erase them.
    expect(updated.routine.category).toEqual(['晨起']);
    expect(updated.routine.difficulty).toBe('中');
    expect(updated.routine.bodypart).toEqual(['全身', '背']);
    db.close();
  });

  it('reports step count and approximate total duration on Home', async () => {
    const { db, routines } = setup();
    await runMigrations(db);

    await routines.create({
      name: '流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      steps: [
        { displayName: 'A', durationSec: 30, transitionSec: 5 },
        { displayName: 'B', durationSec: 30, transitionSec: 5 },
        { displayName: 'C', durationSec: 30, transitionSec: 5 },
      ],
    });

    const summaries = await routines.listSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.stepCount).toBe(3);
    expect(summaries[0]?.totalDurationSec).toBe(100);
    db.close();
  });

  it('replaces steps and re-numbers them on update', async () => {
    const { db, routines } = setup();
    await runMigrations(db);

    const created = await routines.create({
      name: '流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [
        { displayName: 'A', durationSec: 30, transitionSec: 0 },
        { displayName: 'B', durationSec: 30, transitionSec: 0 },
      ],
    });

    const updated = await routines.update(created.routine.id, {
      name: '流程改名',
      defaultDurationSec: 20,
      defaultTransitionSec: 0,
      steps: [
        { displayName: 'C', durationSec: 60, transitionSec: 0 },
        { displayName: 'A', durationSec: 30, transitionSec: 0 },
      ],
    });

    expect(updated.routine.name).toBe('流程改名');
    expect(updated.steps.map((step) => step.displayName)).toEqual(['C', 'A']);
    expect(updated.steps.map((step) => step.orderIndex)).toEqual([0, 1]);
    expect(updated.steps.map((step) => step.durationSec)).toEqual([60, 30]);
    db.close();
  });

  it('keeps bilateral pairing metadata across a save', async () => {
    const { db, routines } = setup();
    await runMigrations(db);

    const created = await routines.create({
      name: '配对',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [
        {
          displayName: '斜方肌（左）',
          durationSec: 45,
          transitionSec: 0,
          side: 'left',
          pairGroupId: 'pair-1',
        },
        {
          displayName: '斜方肌（右）',
          durationSec: 45,
          transitionSec: 0,
          side: 'right',
          pairGroupId: 'pair-1',
        },
      ],
    });

    expect(created.steps[0]?.side).toBe('left');
    expect(created.steps[1]?.side).toBe('right');
    expect(created.steps[0]?.pairGroupId).toBe('pair-1');
    db.close();
  });

  it('rejects a routine with no valid steps and a blank name', async () => {
    const { db, routines } = setup();
    await runMigrations(db);

    await expect(
      routines.create({ name: '空流程', defaultDurationSec: 30, defaultTransitionSec: 0, steps: [] }),
    ).rejects.toThrow('流程至少需要一个步骤');

    await expect(
      routines.create({
        name: '   ',
        defaultDurationSec: 30,
        defaultTransitionSec: 0,
        steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
      }),
    ).rejects.toThrow('流程名称不能为空');

    await expect(
      routines.create({
        name: '流程',
        defaultDurationSec: 30,
        defaultTransitionSec: 0,
        steps: [{ displayName: '  ', durationSec: 30, transitionSec: 0 }],
      }),
    ).rejects.toThrow('步骤名称不能为空');

    db.close();
  });

  it('deletes the routine together with its steps', async () => {
    const { db, routines } = setup();
    await runMigrations(db);

    const created = await routines.create({
      name: '流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
    });

    await routines.remove(created.routine.id);

    expect(await routines.getWithSteps(created.routine.id)).toBeNull();
    const orphan = await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM routine_steps');
    expect(orphan?.total).toBe(0);
    db.close();
  });

  it('returns null for an unknown routine', async () => {
    const { db, routines } = setup();
    await runMigrations(db);
    expect(await routines.getWithSteps('nope')).toBeNull();
    expect(await routines.getById('nope')).toBeNull();
    db.close();
  });

  it('orders the Home list by most recently updated', async () => {
    const { db, clock, routines } = setup();
    await runMigrations(db);

    await routines.create({
      name: '第一个',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
    });
    clock.advance(1_000);
    await routines.create({
      name: '第二个',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [{ displayName: 'B', durationSec: 30, transitionSec: 0 }],
    });

    const routinesList = await routines.list();
    expect(routinesList.map((routine) => routine.name)).toEqual(['第二个', '第一个']);
    db.close();
  });

  it('persists the training type on create and update (TASK-021 写路径)', async () => {
    const { db, routines } = setup();
    await runMigrations(db); // seeds the three builtin training_types rows

    // New routine with an explicit type round-trips.
    const created = await routines.create({
      name: '核心流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      trainingTypeId: 'CORE',
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
    });
    expect(created.routine.trainingTypeId).toBe('CORE');
    expect((await routines.getById(created.routine.id))?.trainingTypeId).toBe('CORE');

    // An update that omits the field keeps the stored type.
    const edited = await routines.update(created.routine.id, {
      name: '核心流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
    });
    expect(edited.routine.trainingTypeId).toBe('CORE');

    // An explicit null re-classifies as 未分类 and round-trips as null.
    const unclassified = await routines.update(created.routine.id, {
      name: '核心流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      trainingTypeId: null,
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
    });
    expect(unclassified.routine.trainingTypeId).toBeNull();
    expect((await routines.getById(created.routine.id))?.trainingTypeId).toBeNull();

    // A brand-new routine without a type defaults to 未分类.
    const fresh = await routines.create({
      name: '未分类流程',
      defaultDurationSec: 10,
      defaultTransitionSec: 0,
      steps: [{ displayName: 'A', durationSec: 10, transitionSec: 0 }],
    });
    expect(fresh.routine.trainingTypeId ?? null).toBeNull();
    db.close();
  });
});
