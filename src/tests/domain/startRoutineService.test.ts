import { createStartRoutineService, buildResumeEvents } from '../../features/runner/services/startRoutineService';
import { createRoutineRepository } from '../../data/repositories/routineRepository';
import { createSessionRepository } from '../../data/repositories/sessionRepository';
import { createSessionHistoryRepository } from '../../data/repositories/sessionHistoryRepository';
import { runMigrations } from '../../data/migrations';
import type { SqlDatabase, SqlParams } from '../../data/db/Database';
import { FakeClock, FakeMonotonicClock } from '../../services/clock';
import { FakeBootInfoProvider } from '../../services/runtime/BootInfo';
import { createSequentialIdGenerator } from '../../shared/utils/id';
import { createNodeSqlDatabase, type NodeSqlDatabase } from '../support/nodeSqlDatabase';

/**
 * R014–R018: the Start Result Contract and the no-silent-replace guarantee.
 */
async function setup() {
  const db: NodeSqlDatabase = createNodeSqlDatabase();
  await runMigrations(db);

  const clock = new FakeClock(1_700_000_000_000);
  const monotonic = new FakeMonotonicClock(0);
  const bootInfo = new FakeBootInfoProvider(1);
  const sessions = createSessionRepository(db);
  const routines = createRoutineRepository({
    db,
    clock,
    generateId: createSequentialIdGenerator('rtn'),
  });
  const service = createStartRoutineService({
    routines,
    sessions,
    monotonic,
    wallClock: clock,
    bootInfo,
    generateId: createSequentialIdGenerator('ses'),
  });

  const routineA = await routines.create({
    name: '流程A',
    defaultDurationSec: 10,
    defaultTransitionSec: 0,
    steps: [{ displayName: 'A1', durationSec: 10, transitionSec: 0 }],
  });
  const routineB = await routines.create({
    name: '流程B',
    defaultDurationSec: 10,
    defaultTransitionSec: 0,
    steps: [{ displayName: 'B1', durationSec: 10, transitionSec: 0 }],
  });

  return { db, clock, monotonic, bootInfo, sessions, routines, service, routineA, routineB };
}

async function countRows(db: NodeSqlDatabase): Promise<number> {
  const row = await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM active_session');
  return row?.total ?? 0;
}

describe('StartRoutineService (R014–R018)', () => {
  it('starts a routine with an INSERT and returns the first-step cue', async () => {
    const { db, service, routineA, sessions } = await setup();

    const result = await service.start(routineA.routine.id);

    expect(result.kind).toBe('started');
    if (result.kind === 'started') {
      expect(result.session.routineId).toBe(routineA.routine.id);
      expect(result.session.snapshot.steps[0]?.displayName).toBe('A1');
      expect(result.events).toEqual([{ type: 'STEP_STARTED', stepIndex: 0, suppressed: false }]);
    }
    expect(await countRows(db)).toBe(1);
    expect((await sessions.loadActive()).status).toBe('ok');
    db.close();
  });

  it('continues the same routine instead of creating a second session', async () => {
    const { db, service, routineA } = await setup();

    const first = await service.start(routineA.routine.id);
    const second = await service.start(routineA.routine.id);

    expect(second.kind).toBe('continue-current');
    if (first.kind === 'started' && second.kind === 'continue-current') {
      expect(second.session.sessionId).toBe(first.session.sessionId);
      expect(second.events).toEqual([{ type: 'STEP_STARTED', stepIndex: 0, suppressed: false }]);
    }
    expect(await countRows(db)).toBe(1);
    db.close();
  });

  it('reports a conflict for a different routine and changes nothing', async () => {
    const { db, service, routineA, routineB } = await setup();
    const first = await service.start(routineA.routine.id);

    const conflict = await service.start(routineB.routine.id);

    expect(conflict.kind).toBe('conflict');
    if (conflict.kind === 'conflict' && first.kind === 'started') {
      expect(conflict.current.sessionId).toBe(first.session.sessionId);
      expect(conflict.current.routineId).toBe(routineA.routine.id);
    }
    // No silent replace: still exactly one row, still routine A.
    const loaded = await service.continueCurrent();
    expect(loaded.kind === 'continue-current' ? loaded.session.routineId : null).toBe(
      routineA.routine.id,
    );
    expect(await countRows(db)).toBe(1);
    db.close();
  });

  it('replaces only when explicitly asked, after the conflict', async () => {
    const { db, service, routineA, routineB } = await setup();
    const first = await service.start(routineA.routine.id);

    const replaced = await service.replaceWith(routineB.routine.id);

    expect(replaced.kind).toBe('started');
    if (replaced.kind === 'started' && first.kind === 'started') {
      expect(replaced.session.routineId).toBe(routineB.routine.id);
      expect(replaced.session.sessionId).not.toBe(first.session.sessionId);
    }
    expect(await countRows(db)).toBe(1);
    db.close();
  });

  it('fails clearly when the routine or the session does not exist', async () => {
    const { db, service } = await setup();

    expect((await service.start('missing')).kind).toBe('failed');
    expect((await service.continueCurrent()).kind).toBe('failed');
    db.close();
  });

  it('does not let a session from a previous boot block a new start', async () => {
    const { db, service, routineA, routineB, bootInfo } = await setup();
    await service.start(routineA.routine.id);

    // The process restarted: the stored session's monotonic origin is gone.
    bootInfo.setBootCount(2);
    const result = await service.start(routineB.routine.id);

    expect(result.kind).toBe('started');
    if (result.kind === 'started') {
      expect(result.session.routineId).toBe(routineB.routine.id);
      expect(result.session.bootCount).toBe(2);
    }
    expect(await countRows(db)).toBe(1);
    db.close();
  });

  it('builds a resume cue for the current phase of an explicit continue', async () => {
    const { db, service, routineA } = await setup();
    const started = await service.start(routineA.routine.id);
    if (started.kind !== 'started') {
      throw new Error('expected started');
    }

    expect(buildResumeEvents(started.session)).toEqual([
      { type: 'STEP_STARTED', stepIndex: 0, suppressed: false },
    ]);
    db.close();
  });
});

/**
 * TASK-021-B1 rework (P1-1): the user-confirmed replace must archive the old
 * session BEFORE the new one starts (V1.3 DoD「替换先归档旧场」＋闸门③) —
 * the old bare DELETE path was the only silent-loss route outside the closed
 * exclusion enum.
 */

/** Wrap the database so one SQL statement fails exactly once (fault injection). */
function failingAt(db: NodeSqlDatabase, needle: string): SqlDatabase {
  let armed = true;
  const inner = db.run.bind(db);
  return {
    exec: db.exec.bind(db),
    all: db.all.bind(db),
    get: db.get.bind(db),
    transaction: db.transaction.bind(db),
    async run(sql: string, params: SqlParams = []) {
      if (armed && sql.includes(needle)) {
        armed = false;
        throw new Error('injected fault');
      }
      return inner(sql, params);
    },
  };
}

describe('replaceWith archives the replaced session (TASK-021-B1 rework)', () => {
  async function setupWithHistory(historyOverride?: ReturnType<typeof createSessionHistoryRepository>) {
    const ctx = await setup();
    const history = historyOverride ?? createSessionHistoryRepository(ctx.db);
    const service = createStartRoutineService({
      routines: ctx.routines,
      sessions: ctx.sessions,
      monotonic: ctx.monotonic,
      wallClock: ctx.clock,
      bootInfo: ctx.bootInfo,
      history,
      generateId: createSequentialIdGenerator('ses'),
    });
    return { ...ctx, history, service };
  }

  it('END-settles and archives the old session before the new one starts', async () => {
    const { db, monotonic, sessions, service, history, routineA, routineB } =
      await setupWithHistory();
    const first = await service.start(routineA.routine.id);
    if (first.kind !== 'started') {
      throw new Error('expected started');
    }

    // 5s of actual action time inside the 10s first step, then replace.
    monotonic.advance(5_000);
    const replaced = await service.replaceWith(routineB.routine.id);

    expect(replaced.kind).toBe('started');
    if (replaced.kind !== 'started') return;

    // The old run landed in history as STOPPED "ended early" — not deleted.
    expect(await history.getTotals()).toEqual({ totalStepMs: 5_000, sessionCount: 1 });
    const recent = await history.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({
      sessionId: first.session.sessionId,
      routineId: routineA.routine.id,
      endState: 'STOPPED',
      endedEarly: true,
      totalStepMs: 5_000,
    });
    // A clean replace is not an anomalous loss.
    expect(await history.listActiveAnomalies()).toEqual([]);

    // Exactly one active row remains, and it is the NEW session.
    expect(await countRows(db)).toBe(1);
    const loaded = await sessions.loadActive();
    if (loaded.status !== 'ok' || loaded.session.routineId !== routineB.routine.id) {
      throw new Error('expected the new session to be active');
    }
    db.close();
  });

  it('treats a 0ms replaced session as an expected exclusion, not a loss', async () => {
    const { db, sessions, service, history, routineA, routineB } = await setupWithHistory();
    await service.start(routineA.routine.id);

    const replaced = await service.replaceWith(routineB.routine.id);

    expect(replaced.kind).toBe('started');
    // Nothing counted, nothing anomalous: the dead 0ms row just cleared.
    expect(await history.getTotals()).toEqual({ totalStepMs: 0, sessionCount: 0 });
    expect(await history.listActiveAnomalies()).toEqual([]);
    expect(await countRows(db)).toBe(1);
    const loaded = await sessions.loadActive();
    if (loaded.status !== 'ok' || loaded.session.routineId !== routineB.routine.id) {
      throw new Error('expected the new session to be active');
    }
    db.close();
  });

  it('keeps the old session and aborts the replace when archiving fails', async () => {
    const ctx = await setupWithHistory();
    const { db, monotonic, sessions, routineA, routineB } = ctx;
    const history = createSessionHistoryRepository(failingAt(db, 'INSERT INTO session_history'));
    const service = createStartRoutineService({
      routines: ctx.routines,
      sessions,
      monotonic,
      wallClock: ctx.clock,
      bootInfo: ctx.bootInfo,
      history,
      generateId: createSequentialIdGenerator('ses'),
    });
    const first = await service.start(routineA.routine.id);
    if (first.kind !== 'started') {
      throw new Error('expected started');
    }
    monotonic.advance(5_000);

    // The history INSERT fails once -> the archive transaction rolls back and
    // the replace must abort WITHOUT deleting the old row or creating the new.
    const failed = await service.replaceWith(routineB.routine.id);
    expect(failed.kind).toBe('failed');
    expect(await history.getTotals()).toEqual({ totalStepMs: 0, sessionCount: 0 });
    const stillOld = await sessions.loadActive();
    if (stillOld.status !== 'ok' || stillOld.session.sessionId !== first.session.sessionId) {
      throw new Error('expected the old session to survive the failed archive');
    }

    // Retry (fault is one-shot): the same old session now archives cleanly.
    const retried = await service.replaceWith(routineB.routine.id);
    expect(retried.kind).toBe('started');
    expect(await history.getTotals()).toEqual({ totalStepMs: 5_000, sessionCount: 1 });
    expect(await countRows(db)).toBe(1);
    const loaded = await sessions.loadActive();
    if (loaded.status !== 'ok' || loaded.session.routineId !== routineB.routine.id) {
      throw new Error('expected the new session to be active');
    }
    db.close();
  });

  it('records the anomalous loss before clearing a previous-boot session on replace', async () => {
    const { db, sessions, service, history, bootInfo, routineA, routineB } =
      await setupWithHistory();
    const first = await service.start(routineA.routine.id);
    if (first.kind !== 'started') {
      throw new Error('expected started');
    }

    // The stored session belongs to a previous boot: its ran time is
    // uncountable, so the replace persists the loss BEFORE clearing.
    bootInfo.setBootCount(2);
    const replaced = await service.replaceWith(routineB.routine.id);

    expect(replaced.kind).toBe('started');
    expect(await history.getTotals()).toEqual({ totalStepMs: 0, sessionCount: 0 });
    const notices = await history.listActiveAnomalies();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.reasonCode).toBe('recovery-boot-changed');
    expect(notices[0]?.sessionId).toBe(first.session.sessionId);
    expect(await countRows(db)).toBe(1);
    const loaded = await sessions.loadActive();
    if (loaded.status !== 'ok' || loaded.session.routineId !== routineB.routine.id) {
      throw new Error('expected the new session to be active');
    }
    db.close();
  });
});
