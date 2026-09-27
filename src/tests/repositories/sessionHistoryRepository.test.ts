import { runMigrations } from '../../data/migrations';
import { runSeeds } from '../../data/seeds';
import type { SqlDatabase } from '../../data/db/Database';
import { createRoutineRepository } from '../../data/repositories/routineRepository';
import { createSessionRepository } from '../../data/repositories/sessionRepository';
import {
  createSessionHistoryRepository,
  type SessionHistoryRepository,
} from '../../data/repositories/sessionHistoryRepository';
import { createSessionPersistence } from '../../features/runner/services/sessionPersistence';
import { applyRunnerControl, advanceRunner, startRunner } from '../../features/runner/domain/runnerMachine';
import type { ActiveSession } from '../../domain/session/ActiveSession';
import { translate } from '../../shared/i18n';
import { FakeClock } from '../../services/clock';
import { createSequentialIdGenerator } from '../../shared/utils/id';
import { makeSteps } from '../support/fixtures';
import { createNodeSqlDatabase, type NodeSqlDatabase } from '../support/nodeSqlDatabase';

/**
 * TASK-021-B1: session history archive.
 *
 * Covers the archive contract end to end against real SQLite: per-step
 * details, sum(明细)==总计, atomicity under injected faults, session_id
 * idempotency, the four terminal classes, cross-midnight dating, frozen
 * offsets, and HD-4 deletion isolation.
 */

const STEPS = makeSteps([
  ['动作A', 30, 5],
  ['动作B', 20, 0],
]);

const END_OFFSET = -480; // UTC+8

function setup(): {
  db: NodeSqlDatabase;
  clock: FakeClock;
  history: SessionHistoryRepository;
  sessions: ReturnType<typeof createSessionRepository>;
} {
  const db = createNodeSqlDatabase();
  return {
    db,
    clock: new FakeClock(Date.parse('2026-09-27T12:00:00.000Z')),
    history: createSessionHistoryRepository(db),
    sessions: createSessionRepository(db),
  };
}

async function seedLibrary(db: NodeSqlDatabase, clock: FakeClock): Promise<void> {
  await runMigrations(db);
  await runSeeds({ db, clock, generateId: createSequentialIdGenerator() });
}

function completedSession(trainingTypeId: string | null = 'STRETCH_RELAX'): ActiveSession {
  const started = startRunner({
    sessionId: 'ses-1',
    routineId: 'routine-1',
    routineName: '晨起全身拉伸',
    steps: STEPS,
    nowElapsedMs: 0,
    wallMs: Date.parse('2026-09-27T10:00:00.000Z'),
    bootCount: 1,
    trainingTypeId,
  });
  return advanceRunner(started.session, STEPS, 55_500).session;
}

function stoppedSession(stopAtMs: number, trainingTypeId: string | null = 'CORE'): ActiveSession {
  const started = startRunner({
    sessionId: 'ses-stop',
    routineId: 'routine-2',
    routineName: '中级核心',
    steps: STEPS,
    nowElapsedMs: 0,
    wallMs: Date.parse('2026-09-27T22:00:00.000Z'),
    bootCount: 1,
    trainingTypeId,
  });
  return applyRunnerControl(started.session, STEPS, { type: 'END' }, stopAtMs).session;
}

/** Wrap the database so one SQL statement fails exactly once (fault injection). */
function failingAt(db: NodeSqlDatabase, needle: string): SqlDatabase & { restore(): void } {
  let armed = true;
  const inner = db.run.bind(db);
  return {
    exec: db.exec.bind(db),
    all: db.all.bind(db),
    get: db.get.bind(db),
    transaction: db.transaction.bind(db),
    async run(sql: string, params = []) {
      if (armed && sql.includes(needle)) {
        armed = false;
        throw new Error('injected fault');
      }
      return inner(sql, params);
    },
    restore() {
      armed = false;
    },
  };
}

describe('session history archive (TASK-021-B1)', () => {
  it('archives a COMPLETED session with per-step details and clears the active row', async () => {
    const { db, clock, history, sessions } = setup();
    await seedLibrary(db, clock);

    const finished = completedSession();
    await sessions.create(finished);

    const outcome = await history.archiveAndClear(finished, {
      endWallMs: Date.parse('2026-09-27T11:00:00.000Z'),
      endTimezoneOffsetMin: END_OFFSET,
    });
    expect(outcome.kind).toBe('archived');
    if (outcome.kind !== 'archived') return;

    expect(outcome.record).toMatchObject({
      sessionId: 'ses-1',
      routineName: '晨起全身拉伸',
      trainingTypeId: 'STRETCH_RELAX',
      startedAtWallMs: Date.parse('2026-09-27T10:00:00.000Z'),
      endedAtWallMs: Date.parse('2026-09-27T11:00:00.000Z'),
      endLocalDate: '2026-09-27',
      endUtcOffsetMin: END_OFFSET,
      totalStepMs: 50_000,
      endState: 'COMPLETED',
      endedEarly: false,
    });

    const details = await history.getStepDetails('ses-1');
    expect(details).toEqual([
      { stepIndex: 0, stepId: 'step-1', stepName: '动作A', trainingTypeId: 'STRETCH_RELAX', effectiveMs: 30_000 },
      { stepIndex: 1, stepId: 'step-2', stepName: '动作B', trainingTypeId: 'STRETCH_RELAX', effectiveMs: 20_000 },
    ]);
    // sum(明细) === 总计, and the transition contributed nothing.
    expect(details.reduce((sum, detail) => sum + detail.effectiveMs, 0)).toBe(50_000);

    // The archive and the clear committed together.
    expect(await sessions.loadActive()).toEqual({ status: 'none' });
    expect(await history.getTotals()).toEqual({ totalStepMs: 50_000, sessionCount: 1 });

    db.close();
  });

  it('is idempotent: archiving the same session twice stores exactly one record', async () => {
    const { db, clock, history } = setup();
    await seedLibrary(db, clock);

    const finished = completedSession();
    const input = {
      endWallMs: Date.parse('2026-09-27T11:00:00.000Z'),
      endTimezoneOffsetMin: END_OFFSET,
    };
    await history.archiveAndClear(finished, input);
    const second = await history.archiveAndClear(finished, input);
    expect(second.kind).toBe('archived');

    expect(await history.getTotals()).toEqual({ totalStepMs: 50_000, sessionCount: 1 });
    expect(await history.getStepDetails('ses-1')).toHaveLength(2);
    expect(await history.getRecent(10)).toHaveLength(1);

    db.close();
  });

  it('rolls back completely when the detail insert fails (atomicity fault injection)', async () => {
    const { db, clock, sessions } = setup();
    await seedLibrary(db, clock);

    const finished = completedSession();
    await sessions.create(finished);

    const faulty = failingAt(db, 'INSERT INTO session_history_steps');
    const faultyHistory = createSessionHistoryRepository(faulty);

    await expect(
      faultyHistory.archiveAndClear(finished, {
        endWallMs: Date.parse('2026-09-27T11:00:00.000Z'),
        endTimezoneOffsetMin: END_OFFSET,
      }),
    ).rejects.toThrow('归档训练记录失败');

    // Nothing was written and the session is still resumable for a retry.
    expect(await history0Totals(db)).toEqual({ totalStepMs: 0, sessionCount: 0 });
    expect((await sessions.loadActive()).status).toBe('ok');

    // The retry (fault disarmed) succeeds and accounts exactly once.
    const healthy = createSessionHistoryRepository(db);
    const outcome = await healthy.archiveAndClear(finished, {
      endWallMs: Date.parse('2026-09-27T11:00:00.000Z'),
      endTimezoneOffsetMin: END_OFFSET,
    });
    expect(outcome.kind).toBe('archived');
    expect(await history0Totals(db)).toEqual({ totalStepMs: 50_000, sessionCount: 1 });
    expect(await sessions.loadActive()).toEqual({ status: 'none' });

    db.close();
  });

  async function history0Totals(db: NodeSqlDatabase) {
    const history = createSessionHistoryRepository(db);
    return history.getTotals();
  }

  it('classifies the four terminal outcomes', async () => {
    const { db, clock, history, sessions } = setup();
    await seedLibrary(db, clock);
    const end = { endWallMs: Date.parse('2026-09-27T23:30:00.000Z'), endTimezoneOffsetMin: END_OFFSET };

    // 1. STOPPED with >0ms counts and is flagged "ended early".
    await sessions.create(stoppedSession(10_000));
    const stopped = await history.archiveAndClear(stoppedSession(10_000), end);
    expect(stopped).toEqual({
      kind: 'archived',
      record: expect.objectContaining({
        sessionId: 'ses-stop',
        endState: 'STOPPED',
        endedEarly: true,
        totalStepMs: 10_000,
      }),
    });

    // 2. STOPPED at 0ms is an expected exclusion (neutral, no notice).
    const zero = stoppedSession(0, 'WARMUP');
    await sessions.create({ ...zero, sessionId: 'ses-zero' });
    const zeroOutcome = await history.archiveAndClear({ ...zero, sessionId: 'ses-zero' }, end);
    expect(zeroOutcome).toEqual({ kind: 'excluded', reason: 'no-action-time' });

    // 3. ERROR is an expected exclusion.
    const errorSession = { ...stoppedSession(5_000, 'CORE'), state: 'ERROR' as const };
    await sessions.create({ ...errorSession, sessionId: 'ses-error' });
    const errorOutcome = await history.archiveAndClear({ ...errorSession, sessionId: 'ses-error' }, end);
    expect(errorOutcome).toEqual({ kind: 'excluded', reason: 'terminal-error' });

    // 4. A pre-stats (ineligible) session is an expected exclusion.
    const stale = { ...completedSession('CORE'), statsEligible: false };
    await sessions.create({ ...stale, sessionId: 'ses-stale' });
    const staleOutcome = await history.archiveAndClear({ ...stale, sessionId: 'ses-stale' }, end);
    expect(staleOutcome).toEqual({ kind: 'excluded', reason: 'session-not-eligible' });

    // Exactly one archived record; exclusions left no history and no notices.
    expect(await history.getTotals()).toEqual({ totalStepMs: 10_000, sessionCount: 1 });
    expect(await history.listActiveAnomalies()).toEqual([]);
    // Excluded sessions still had their dead rows cleared.
    expect(await sessions.loadActive()).toEqual({ status: 'none' });

    // A live session is simply not archivable.
    const started = startRunner({
      sessionId: 'ses-live',
      routineId: 'routine-1',
      routineName: 'n',
      steps: STEPS,
      nowElapsedMs: 0,
      wallMs: 1,
      bootCount: 1,
      trainingTypeId: null,
    });
    expect(await history.archiveAndClear(started.session, end)).toEqual({ kind: 'not-terminal' });

    db.close();
  });

  it('refuses to archive when the wall clock moved backwards, and records the anomaly (V1.3 日期不可信不猜)', async () => {
    const { db, clock, history, sessions } = setup();
    await seedLibrary(db, clock);

    // R006 proved a clock change does not drop the session, so "the user set
    // the system clock back mid-session" is a reachable path: end < start.
    const finished = completedSession(); // started 2026-09-27T10:00Z
    await sessions.create(finished);
    const outcome = await history.archiveAndClear(finished, {
      endWallMs: Date.parse('2026-09-27T09:00:00.000Z'),
      endTimezoneOffsetMin: END_OFFSET,
    });

    // Not archived (the local end date would be a pure guess), and because
    // this is outside the closed expected-exclusion enum it is an anomalous
    // loss with a persisted notice.
    expect(outcome).toEqual({ kind: 'wall-date-untrusted' });
    expect(await history.getTotals()).toEqual({ totalStepMs: 0, sessionCount: 0 });
    const notices = await history.listActiveAnomalies();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.reasonCode).toBe('wall-date-untrusted');
    expect(notices[0]?.sessionId).toBe('ses-1');
    expect(notices[0]?.occurredAtWallMs).toBe(Date.parse('2026-09-27T09:00:00.000Z'));

    // The dead terminal row is cleared; the loss is carried by the notice.
    expect(await sessions.loadActive()).toEqual({ status: 'none' });

    // The reason code maps to a real key in BOTH languages (never inline).
    const key = 'stats.anomaly.wall-date-untrusted';
    expect(translate('zh', key)).not.toBe(key);
    expect(translate('en', key)).not.toBe(key);

    db.close();
  });

  it('does not stack duplicate wall-date notices on a retry, and keeps the row when the notice write fails', async () => {
    const { db, clock, history, sessions } = setup();
    await seedLibrary(db, clock);

    const finished = completedSession();
    await sessions.create(finished);
    const end = { endWallMs: Date.parse('2026-09-27T09:00:00.000Z'), endTimezoneOffsetMin: END_OFFSET };

    // Retry after the first notice: dedup by session_id keeps exactly one.
    await history.archiveAndClear(finished, end);
    await sessions.create(finished); // simulate the row surviving a failed clear
    await history.archiveAndClear(finished, end);
    expect(await history.listActiveAnomalies()).toHaveLength(1);
    db.close();

    // A failed notice write must keep the active row (V1.3: 通知写失败不得静默清行).
    const db2setup = setup();
    await seedLibrary(db2setup.db, db2setup.clock);
    const guarded = failingAt(db2setup.db, 'stats_anomaly_notice');
    const guardedHistory = createSessionHistoryRepository(guarded);
    await db2setup.sessions.create(finished);
    await expect(guardedHistory.archiveAndClear(finished, end)).rejects.toThrow();
    // Nothing archived and the session is still there, ready for a retry.
    expect(await db2setup.history.getTotals()).toEqual({ totalStepMs: 0, sessionCount: 0 });
    const loaded = await db2setup.sessions.loadActive();
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.session.sessionId).toBe('ses-1');
    }
    db2setup.db.close();
  });

  it('dates the whole session on the end date across midnight, and never re-dates stored rows', async () => {
    const { db, clock, history } = setup();
    await seedLibrary(db, clock);

    // Started 23:50 local, ended 00:10 local next day: the whole session
    // belongs to 09-28.
    const finished = completedSession();
    await history.archiveAndClear(finished, {
      endWallMs: Date.parse('2026-09-27T16:10:00.000Z'), // 00:10 +08
      endTimezoneOffsetMin: END_OFFSET,
    });

    // Later sessions archived under a DIFFERENT offset keep their own dates.
    const second = { ...completedSession('WARMUP'), sessionId: 'ses-2' };
    await history.archiveAndClear(second, {
      endWallMs: Date.parse('2026-09-28T02:00:00.000Z'),
      endTimezoneOffsetMin: 0, // UTC device
    });

    const recent = await history.getRecent(10);
    expect(recent.map((record) => record.endLocalDate)).toEqual(['2026-09-28', '2026-09-28']);
    expect(recent[0]?.endUtcOffsetMin).toBe(0);
    expect(recent[1]?.endUtcOffsetMin).toBe(END_OFFSET);

    db.close();
  });

  it('aggregates by type from the table (NULL bucket included), extensible without code changes', async () => {
    const { db, clock, history } = setup();
    await seedLibrary(db, clock);
    const end = { endWallMs: Date.parse('2026-09-27T11:00:00.000Z'), endTimezoneOffsetMin: END_OFFSET };

    await history.archiveAndClear(completedSession('STRETCH_RELAX'), end);
    await history.archiveAndClear({ ...completedSession('CORE'), sessionId: 'ses-2' }, end);
    await history.archiveAndClear({ ...completedSession(null), sessionId: 'ses-3' }, end);

    const byType = await history.getTotalsByType();
    expect(byType).toHaveLength(3);
    const total = byType.reduce((sum, bucket) => sum + bucket.totalStepMs, 0);
    expect(total).toBe(150_000);
    expect(await history.getTotals()).toEqual({ totalStepMs: 150_000, sessionCount: 3 });

    // Extensibility: a future migration inserts one row and the aggregation
    // picks it up — no enum, no switch, no code change (HD-1/HD-5 DoD).
    await db.run(
      `INSERT INTO training_types (type_id, name_zh, name_en, sort_order) VALUES ('LOWER_BODY', '下肢训练', 'Lower Body', 4)`,
    );
    await history.archiveAndClear({ ...completedSession('LOWER_BODY'), sessionId: 'ses-4' }, end);
    const extended = await history.getTotalsByType();
    expect(extended.map((bucket) => bucket.trainingTypeId)).toContain('LOWER_BODY');
    expect(
      extended.reduce((sum, bucket) => sum + bucket.totalStepMs, 0),
    ).toBe(200_000);
    expect((await history.listTrainingTypes()).map((type) => type.typeId)).toContain('LOWER_BODY');

    db.close();
  });

  it('orders recent records by end time then session id', async () => {
    const { db, clock, history } = setup();
    await seedLibrary(db, clock);

    // End times after the fixture start (2026-09-27T10:00Z); the offsets are
    // ms after it. (End < start is refused as wall-date-untrusted since the
    // P1-3 rework, so ordering fixtures use realistic timestamps.)
    const startMs = Date.parse('2026-09-27T10:00:00.000Z');
    for (const [index, offset] of [3_000, 1_000, 3_000, 2_000].entries()) {
      await history.archiveAndClear(
        { ...completedSession('CORE'), sessionId: `ses-${index}` },
        { endWallMs: startMs + offset, endTimezoneOffsetMin: END_OFFSET },
      );
    }
    const recent = await history.getRecent(3);
    // Time DESC, then session id DESC as the stable tie-breaker.
    expect(recent.map((record) => record.sessionId)).toEqual(['ses-2', 'ses-0', 'ses-3']);

    db.close();
  });

  it('deletes single records and clears all stats without touching user data', async () => {
    const { db, clock, history } = setup();
    await seedLibrary(db, clock);
    const end = { endWallMs: Date.parse('2026-09-27T11:00:00.000Z'), endTimezoneOffsetMin: END_OFFSET };

    await history.archiveAndClear(completedSession('STRETCH_RELAX'), end);
    await history.archiveAndClear({ ...completedSession('CORE'), sessionId: 'ses-2' }, end);
    await history.recordAnomaly('recovery-boot-changed', { sessionId: 'ses-2' });

    expect(await history.deleteRecord('ses-2')).toBe(true);
    expect(await history.deleteRecord('nope')).toBe(false);
    expect(await history.getTotals()).toEqual({ totalStepMs: 50_000, sessionCount: 1 });
    expect(await history.getStepDetails('ses-2')).toEqual([]);

    await history.clearAllStats();
    expect(await history.getTotals()).toEqual({ totalStepMs: 0, sessionCount: 0 });
    expect(await history.getStepDetails('ses-1')).toEqual([]);
    expect(await history.listActiveAnomalies()).toEqual([]);

    // HD-4 isolation: user-owned data and seed markers are untouched.
    const routines = createRoutineRepository({ db, clock, generateId: createSequentialIdGenerator() });
    expect(await routines.list()).toHaveLength(9);
    expect(
      (await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM actions'))?.total,
    ).toBe(59);
    expect(
      (await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'seed_version'"))
        ?.value,
    ).toBe('1');
    expect(
      await db.get<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = 'seed_examples_cleared'",
      ),
    ).toBeNull();

    db.close();
  });

  it('records and dismisses anomaly notices', async () => {
    const { db, clock, history } = setup();
    await runMigrations(db);

    await history.recordAnomaly('recovery-boot-changed', { sessionId: 'ses-1', wallMs: 1_000 });
    await history.recordAnomaly('archive-failed', { sessionId: 'ses-1', wallMs: 2_000 });

    const active = await history.listActiveAnomalies();
    expect(active.map((notice) => notice.reasonCode)).toEqual(['archive-failed', 'recovery-boot-changed']);
    expect(active.every((notice) => notice.dismissedAtWallMs === null)).toBe(true);

    await history.dismissAllAnomalies(3_000);
    expect(await history.listActiveAnomalies()).toEqual([]);

    db.close();
  });

  it('persistence routes terminal sessions through the archive in one call', async () => {
    const { db, clock, history, sessions } = setup();
    await seedLibrary(db, clock);

    const finished = completedSession();
    await sessions.create(finished);

    const persistence = createSessionPersistence({
      repository: sessions,
      wallClock: clock,
      history,
    });
    clock.set(Date.parse('2026-09-27T11:00:00.000Z'));
    await persistence.save(finished);

    expect(await history.getTotals()).toEqual({ totalStepMs: 50_000, sessionCount: 1 });
    expect(await sessions.loadActive()).toEqual({ status: 'none' });

    // Without a history dependency the legacy clear() behaviour holds.
    const legacy = createSessionPersistence({ repository: sessions, wallClock: clock });
    await legacy.save(finished);
    expect(await history.getTotals()).toEqual({ totalStepMs: 50_000, sessionCount: 1 });

    db.close();
  });
});
