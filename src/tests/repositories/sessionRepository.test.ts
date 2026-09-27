import { createSessionRepository } from '../../data/repositories/sessionRepository';
import { runMigrations } from '../../data/migrations';
import type { ActiveSession } from '../../domain/session/ActiveSession';
import { createSnapshot } from '../../domain/session/SessionSnapshot';
import { makeSteps } from '../support/fixtures';
import { createNodeSqlDatabase, type NodeSqlDatabase } from '../support/nodeSqlDatabase';

const STEPS = makeSteps([['A', 30, 5]]);

function makeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  const snapshot = createSnapshot({
    routineId: 'routine-1',
    routineName: '测试流程',
    steps: STEPS,
    capturedAtWallMs: 1_700_000_000_000,
  });
  return {
    sessionId: 'session-1',
    routineId: 'routine-1',
    routineName: '测试流程',
    state: 'RUNNING_STEP',
    currentStepIndex: 0,
    phaseStartedElapsedMs: 1_000,
    pausedAtElapsedMs: null,
    accumulatedPauseMs: 3_000,
    effectiveStepDurationMs: 45_000,
    effectiveTransitionDurationMs: 5_000,
    runtimeExtensionMs: 10_000,
    completedPhaseMs: 12_000,
    lastUpdatedElapsedMs: 5_000,
    updatedAtWallMs: 1_700_000_010_000,
    bootCount: 4,
    trainingTypeId: null,
    statsEligible: true,
    statsTotalStepMs: 0,
    statsStepLedger: {},
    snapshotVersion: snapshot.version,
    snapshot,
    ...overrides,
  };
}

async function setup() {
  const db: NodeSqlDatabase = createNodeSqlDatabase();
  await runMigrations(db);
  return { db, sessions: createSessionRepository(db) };
}

async function countRows(db: NodeSqlDatabase): Promise<number> {
  const row = await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM active_session');
  return row?.total ?? 0;
}

describe('active session repository V2 (R011)', () => {
  it('round-trips every authoritative field, including the snapshot', async () => {
    const { db, sessions } = await setup();
    const session = makeSession();

    await sessions.create(session);
    const loaded = await sessions.loadActive();

    expect(loaded).toEqual({ status: 'ok', session });
    db.close();
  });

  it('rejects a second create instead of silently replacing a running session', async () => {
    const { db, sessions } = await setup();
    await sessions.create(makeSession({ sessionId: 'first' }));

    await expect(sessions.create(makeSession({ sessionId: 'second' }))).rejects.toThrow();

    // The original session survives untouched.
    const loaded = await sessions.loadActive();
    expect(loaded.status === 'ok' ? loaded.session.sessionId : null).toBe('first');
    expect(await countRows(db)).toBe(1);
    db.close();
  });

  it('updates the existing row in place with save()', async () => {
    const { db, sessions } = await setup();
    await sessions.create(makeSession());
    await sessions.save(makeSession({ state: 'PAUSED_STEP', pausedAtElapsedMs: 9_000 }));

    const loaded = await sessions.loadActive();
    expect(loaded.status === 'ok' ? loaded.session.state : null).toBe('PAUSED_STEP');
    expect(await countRows(db)).toBe(1);
    db.close();
  });

  it('throws on save() when no session exists (never invents one)', async () => {
    const { db, sessions } = await setup();
    await expect(sessions.save(makeSession())).rejects.toThrow();
    db.close();
  });

  it('replaces explicitly only when asked', async () => {
    const { db, sessions } = await setup();
    await sessions.create(makeSession({ sessionId: 'first' }));
    await sessions.replace(makeSession({ sessionId: 'second', routineId: 'routine-2' }));

    const loaded = await sessions.loadActive();
    expect(loaded.status === 'ok' ? loaded.session.sessionId : null).toBe('second');
    expect(await countRows(db)).toBe(1);
    db.close();
  });

  it('clears the session so recovery cannot resurrect a finished routine', async () => {
    const { db, sessions } = await setup();
    await sessions.create(makeSession());
    await sessions.clear();
    expect(await sessions.loadActive()).toEqual({ status: 'none' });
    db.close();
  });

  it('reports none when nothing is stored', async () => {
    const { db, sessions } = await setup();
    expect(await sessions.loadActive()).toEqual({ status: 'none' });
    db.close();
  });

  it('fail-safes on corrupt JSON and clears the unusable row', async () => {
    const { db, sessions } = await setup();
    await db.run(
      `INSERT INTO active_session
         (id, session_id, routine_id, routine_name, state, current_step_index,
          phase_started_elapsed_ms, paused_at_elapsed_ms, accumulated_pause_ms,
          effective_step_duration_ms, effective_transition_duration_ms, runtime_extension_ms,
          completed_phase_ms, last_updated_elapsed_ms, updated_at_wall_ms, boot_count,
          snapshot_version, snapshot)
       VALUES (1, 's', 'r', 'n', 'RUNNING_STEP', 0, 1000, NULL, 0, 10000, 0, 0, 0, 1000, 1000, 1, 1, '{not json')`,
    );

    const loaded = await sessions.loadActive();
    expect(loaded.status).toBe('corrupt');
    expect(await countRows(db)).toBe(0);
    db.close();
  });

  it('fail-safes on an unknown snapshot version', async () => {
    const { db, sessions } = await setup();
    const snapshot = createSnapshot({
      routineId: 'r',
      routineName: 'n',
      steps: STEPS,
      capturedAtWallMs: 1,
    });
    await db.run(
      `INSERT INTO active_session
         (id, session_id, routine_id, routine_name, state, current_step_index,
          phase_started_elapsed_ms, paused_at_elapsed_ms, accumulated_pause_ms,
          effective_step_duration_ms, effective_transition_duration_ms, runtime_extension_ms,
          completed_phase_ms, last_updated_elapsed_ms, updated_at_wall_ms, boot_count,
          snapshot_version, snapshot)
       VALUES (1, 's', 'r', 'n', 'RUNNING_STEP', 0, 1000, NULL, 0, 10000, 0, 0, 0, 1000, 1000, 1, 99, ?)`,
      [JSON.stringify(snapshot)],
    );

    expect((await sessions.loadActive()).status).toBe('corrupt');
    expect(await countRows(db)).toBe(0);
    db.close();
  });

  it('fail-safes on an unknown runner state instead of guessing', async () => {
    const { db, sessions } = await setup();
    const snapshot = createSnapshot({
      routineId: 'r',
      routineName: 'n',
      steps: STEPS,
      capturedAtWallMs: 1,
    });
    await db.run(
      `INSERT INTO active_session
         (id, session_id, routine_id, routine_name, state, current_step_index,
          phase_started_elapsed_ms, paused_at_elapsed_ms, accumulated_pause_ms,
          effective_step_duration_ms, effective_transition_duration_ms, runtime_extension_ms,
          completed_phase_ms, last_updated_elapsed_ms, updated_at_wall_ms, boot_count,
          snapshot_version, snapshot)
       VALUES (1, 's', 'r', 'n', 'NOT_A_STATE', 0, 1000, NULL, 0, 10000, 0, 0, 0, 1000, 1000, 1, 1, ?)`,
      [JSON.stringify(snapshot)],
    );

    expect((await sessions.loadActive()).status).toBe('corrupt');
    db.close();
  });

  it('preserves nullable elapsed timestamps', async () => {
    const { db, sessions } = await setup();
    await sessions.create(makeSession({ pausedAtElapsedMs: null, phaseStartedElapsedMs: null }));

    const loaded = await sessions.loadActive();
    expect(loaded.status === 'ok' ? loaded.session.pausedAtElapsedMs : 'missing').toBeNull();
    expect(loaded.status === 'ok' ? loaded.session.phaseStartedElapsedMs : 'missing').toBeNull();
    db.close();
  });
});
