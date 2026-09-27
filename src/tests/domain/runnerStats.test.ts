import { applyRunnerControl, advanceRunner, startRunner } from '../../features/runner/domain/runnerMachine';
import { makeSteps } from '../support/fixtures';

/**
 * TASK-021-B1: actual-action-time settlement inside the runner machine.
 *
 * Invariants under test:
 * - only step phases count; transitions and pauses never do (HD-6);
 * - Skip/Previous/End settle exactly the part actually run (HD-2);
 * - `sum(ledger) === statsTotalStepMs` always holds, per-step entries key by
 *   step index so a Previous re-run adds up;
 * - pre-stats (ineligible) sessions are never accounted;
 * - the wall clock plays no role anywhere.
 */

const STEPS = makeSteps([
  ['动作A', 30, 5],
  ['动作B', 20, 0],
]);

function start(nowElapsedMs = 0, overrides: Partial<Parameters<typeof startRunner>[0]> = {}) {
  return startRunner({
    sessionId: 'ses-1',
    routineId: 'routine-1',
    routineName: '测试流程',
    steps: STEPS,
    nowElapsedMs,
    wallMs: 1_700_000_000_000,
    bootCount: 1,
    trainingTypeId: 'STRETCH_RELAX',
    ...overrides,
  });
}

function totalMs(session: { statsTotalStepMs: number; statsStepLedger: Record<string, number> }): {
  total: number;
  ledgerSum: number;
} {
  const ledgerSum = Object.values(session.statsStepLedger).reduce((a, b) => a + b, 0);
  return { total: session.statsTotalStepMs, ledgerSum };
}

describe('runner stats settlement (TASK-021-B1)', () => {
  it('freezes the training type at start and starts an eligible zero ledger', () => {
    const { session } = start();
    expect(session.trainingTypeId).toBe('STRETCH_RELAX');
    expect(session.statsEligible).toBe(true);
    expect(session.statsTotalStepMs).toBe(0);
    expect(session.statsStepLedger).toEqual({});
  });

  it('a full run counts only step time, never the transition', () => {
    const started = start();
    // 30s step + 5s transition + 20s step, plus margin.
    const result = advanceRunner(started.session, STEPS, 55_500);
    const session = result.session;

    expect(session.state).toBe('COMPLETED');
    expect(totalMs(session)).toEqual({ total: 50_000, ledgerSum: 50_000 });
    expect(session.statsStepLedger).toEqual({ '0': 30_000, '1': 20_000 });
    // The settled segments cover each step exactly once.
    expect(result.settled).toEqual([
      { stepIndex: 0, ms: 30_000 },
      { stepIndex: 1, ms: 20_000 },
    ]);
  });

  it('a background catch-up crossing several boundaries settles each step once', () => {
    const started = start();
    // Way past the end (simulated long background gap): same totals.
    const result = advanceRunner(started.session, STEPS, 10 * 60_000);
    expect(result.session.state).toBe('COMPLETED');
    expect(totalMs(result.session)).toEqual({ total: 50_000, ledgerSum: 50_000 });
  });

  it('skipping a step counts only the part actually run', () => {
    const started = start();
    const skipped = applyRunnerControl(started.session, STEPS, { type: 'SKIP' }, 10_000);
    expect(skipped.settled).toEqual([{ stepIndex: 0, ms: 10_000 }]);

    const finished = advanceRunner(skipped.session, STEPS, 10_000 + 20_500);
    expect(finished.session.state).toBe('COMPLETED');
    expect(totalMs(finished.session)).toEqual({ total: 30_000, ledgerSum: 30_000 });
    expect(finished.session.statsStepLedger).toEqual({ '0': 10_000, '1': 20_000 });
  });

  it('skipping a transition counts nothing', () => {
    const started = start();
    const inTransition = advanceRunner(started.session, STEPS, 30_500);
    expect(inTransition.session.state).toBe('RUNNING_TRANSITION');
    expect(inTransition.settled).toEqual([{ stepIndex: 0, ms: 30_000 }]);

    const skipped = applyRunnerControl(inTransition.session, STEPS, { type: 'SKIP' }, 31_000);
    expect(skipped.settled).toEqual([]);
    expect(totalMs(skipped.session)).toEqual({ total: 30_000, ledgerSum: 30_000 });
  });

  it('Previous counts both passes of the re-run step under one ledger key', () => {
    const started = start();
    // A completes (30s) + transition (5s) + 5s into B, then back to A.
    const intoB = advanceRunner(started.session, STEPS, 40_000);
    const back = applyRunnerControl(intoB.session, STEPS, { type: 'PREVIOUS' }, 40_500);
    // The abandoned 5.5s of B is settled; the restarted A starts from zero.
    expect(back.settled).toEqual([{ stepIndex: 1, ms: 5_500 }]);
    expect(back.session.state).toBe('RUNNING_STEP');
    expect(back.session.currentStepIndex).toBe(0);

    const finished = advanceRunner(back.session, STEPS, 40_500 + 55_500);
    expect(finished.session.state).toBe('COMPLETED');
    // A twice (30s + 30s) + B partial (5.5s) + B full (20s).
    expect(totalMs(finished.session)).toEqual({ total: 85_500, ledgerSum: 85_500 });
    expect(finished.session.statsStepLedger).toEqual({ '0': 60_000, '1': 25_500 });
  });

  it('a runtime +10s counts only when actually run; ending early counts the part run', () => {
    const started = start();
    const extended = applyRunnerControl(started.session, STEPS, { type: 'ADD_TIME' }, 5_000);
    expect(extended.session.effectiveStepDurationMs).toBe(40_000);

    // End at 35s of the extended 40s step: 35s counted, not 40s.
    const ended = applyRunnerControl(extended.session, STEPS, { type: 'END' }, 35_000);
    expect(ended.session.state).toBe('STOPPED');
    expect(totalMs(ended.session)).toEqual({ total: 35_000, ledgerSum: 35_000 });
  });

  it('pausing freezes the count; END during a transition counts the step time only', () => {
    const started = start();
    const paused = applyRunnerControl(started.session, STEPS, { type: 'PAUSE' }, 10_000);
    // Time passes while paused (monotonic keeps running), nothing accrues.
    const ended = applyRunnerControl(paused.session, STEPS, { type: 'END' }, 10 * 60_000);
    expect(ended.session.state).toBe('STOPPED');
    expect(totalMs(ended.session)).toEqual({ total: 10_000, ledgerSum: 10_000 });

    // Ending during the transition after step A: still just the 30s of A.
    const started2 = start();
    const inTransition = advanceRunner(started2.session, STEPS, 32_000);
    const ended2 = applyRunnerControl(inTransition.session, STEPS, { type: 'END' }, 33_000);
    expect(ended2.session.state).toBe('STOPPED');
    expect(totalMs(ended2.session)).toEqual({ total: 30_000, ledgerSum: 30_000 });
  });

  it('ending at 0ms leaves an empty ledger (excluded from stats at archive)', () => {
    const started = start();
    const ended = applyRunnerControl(started.session, STEPS, { type: 'END' }, 0);
    expect(ended.session.state).toBe('STOPPED');
    expect(totalMs(ended.session)).toEqual({ total: 0, ledgerSum: 0 });
  });

  it('never accounts a pre-stats (ineligible) session', () => {
    const started = start(0, { trainingTypeId: null });
    const ineligible = { ...started.session, statsEligible: false };
    const result = advanceRunner(ineligible, STEPS, 55_500);
    expect(result.session.state).toBe('COMPLETED');
    expect(totalMs(result.session)).toEqual({ total: 0, ledgerSum: 0 });
    expect(result.settled).toEqual([]);
  });

  it('same-boot recovery re-settles only from the persisted state (no double count)', () => {
    // A tick at 30.5s settles step A and persists. The app then dies before
    // the next persist; recovery restarts from the LAST PERSISTED state.
    const started = start();
    const firstTick = advanceRunner(started.session, STEPS, 30_500);
    expect(totalMs(firstTick.session)).toEqual({ total: 30_000, ledgerSum: 30_000 });

    // Simulate the stale persisted row (pre-boundary) recovering after death:
    // settle everything from scratch — the ledger matches, never doubles.
    const recovered = advanceRunner(started.session, STEPS, 55_500);
    expect(totalMs(recovered.session)).toEqual({ total: 50_000, ledgerSum: 50_000 });
  });
});
