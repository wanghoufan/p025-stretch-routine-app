import type { ActiveSession } from '../../../domain/session/ActiveSession';
import { isActive, isPaused, isRunning, togglePauseState } from '../../../domain/session/RunnerState';
import { createSnapshot } from '../../../domain/session/SessionSnapshot';
import type { RoutineStep } from '../../../domain/routine/RoutineStep';
import { ADD_TIME_MS } from '../../../domain/routine/constants';
import { RunnerError } from '../../../shared/errors';
import { phaseElapsedMs, phaseTotalMs, plannedCompletedMsBefore } from './runnerTime';
import {
  settleCompletedPhase,
  settleCurrentPhase,
  type SettledSegment,
} from './runnerStats';
import {
  completeSession,
  shouldPlayTransition,
  startStepPhase,
  startTransitionPhase,
  stopSession,
} from './runnerTransitions';

/**
 * Pure runner state machine (Constitution §3.2/§3.3, PLAN §5, §7).
 *
 * The machine is a set of pure functions: given the current session, the
 * snapshot steps and an explicit **monotonic** `nowElapsedMs`, it returns the
 * next session plus the events the cue coordinator may speak. It never touches a
 * timer, the UI or TTS, which is what keeps runner behaviour deterministic and
 * testable — and it never reads the wall clock, so a wall-clock jump cannot move
 * the countdown (R007/R012).
 */

export type RunnerEvent =
  | { type: 'STEP_STARTED'; stepIndex: number; suppressed: boolean }
  | { type: 'TRANSITION_STARTED'; fromStepIndex: number; toStepIndex: number; suppressed: boolean }
  | { type: 'COMPLETED' }
  | { type: 'STOPPED' };

export interface RunnerResult {
  session: ActiveSession;
  events: RunnerEvent[];
  /**
   * Actual action time settled by this transition, per step. Informational:
   * the ledger on the returned session is already updated, so callers never
   * consume these numbers themselves (exactly-once by construction).
   */
  settled: readonly SettledSegment[];
}

export type RunnerControl =
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ADD_TIME'; ms?: number }
  | { type: 'PREVIOUS' }
  | { type: 'SKIP' }
  | { type: 'END' };

export interface StartRunnerInput {
  sessionId: string;
  routineId: string;
  routineName: string;
  /** Ordered steps to freeze into the immutable snapshot. */
  steps: readonly RoutineStep[];
  /** Monotonic elapsed ms when the run starts. */
  nowElapsedMs: number;
  /** Wall-clock ms at start, kept for display/age only. */
  wallMs: number;
  /** Boot identity that owns `nowElapsedMs`. */
  bootCount: number;
  /** Training type frozen at start (HD-1/HD-5); null = 未分类. */
  trainingTypeId?: string | null;
}

/** Start a routine at step 0 (SPEC US1 scenario 1). */
export function startRunner(input: StartRunnerInput): RunnerResult {
  if (input.steps.length === 0) {
    throw new RunnerError('流程没有可播放的步骤');
  }
  const first = input.steps[0];
  if (!first) {
    throw new RunnerError('流程没有可播放的步骤');
  }

  const snapshot = createSnapshot({
    routineId: input.routineId,
    routineName: input.routineName,
    steps: input.steps,
    capturedAtWallMs: input.wallMs,
  });

  const session: ActiveSession = {
    sessionId: input.sessionId,
    routineId: input.routineId,
    routineName: input.routineName,
    state: 'RUNNING_STEP',
    currentStepIndex: 0,
    phaseStartedElapsedMs: input.nowElapsedMs,
    pausedAtElapsedMs: null,
    accumulatedPauseMs: 0,
    effectiveStepDurationMs: first.durationSec * 1000,
    effectiveTransitionDurationMs: first.transitionSec * 1000,
    runtimeExtensionMs: 0,
    completedPhaseMs: 0,
    lastUpdatedElapsedMs: input.nowElapsedMs,
    updatedAtWallMs: input.wallMs,
    bootCount: input.bootCount,
    trainingTypeId: input.trainingTypeId ?? null,
    statsEligible: true,
    statsTotalStepMs: 0,
    statsStepLedger: {},
    snapshotVersion: snapshot.version,
    snapshot,
  };

  return { session, events: [{ type: 'STEP_STARTED', stepIndex: 0, suppressed: false }], settled: [] };
}

/**
 * Resolve every phase boundary that `nowElapsedMs` has already crossed.
 *
 * A single call can cross several boundaries at once — that is exactly what
 * happens after the app sat in the background for a few minutes. Intermediate
 * step cues are marked `suppressed` so recovery never replays stale speech.
 */
export function advanceRunner(
  session: ActiveSession,
  steps: readonly RoutineStep[],
  nowElapsedMs: number,
): RunnerResult {
  if (steps.length === 0 || !isRunning(session.state)) {
    return { session, events: [], settled: [] };
  }

  const batches: RunnerEvent[][] = [];
  const settled: SettledSegment[] = [];
  const guard = steps.length * 2 + 4;
  let current = session;

  while (batches.length < guard && isRunning(current.state)) {
    const total = phaseTotalMs(current);
    const elapsed = phaseElapsedMs(current, nowElapsedMs);
    if (elapsed < total) {
      break;
    }

    const overflowMs = Math.max(0, elapsed - total);
    const completedPhaseMs = current.completedPhaseMs + total;
    const batch: RunnerEvent[] = [];

    if (current.state === 'RUNNING_STEP') {
      const fromIndex = current.currentStepIndex;
      const nextIndex = fromIndex + 1;

      // The step phase really ran to its boundary: settle its full effective
      // duration before the machine leaves the phase (transitions settle 0).
      const completed = settleCompletedPhase(current);
      current = completed.session;
      if (completed.settled) {
        settled.push(completed.settled);
      }

      if (shouldPlayTransition(steps, fromIndex)) {
        current = startTransitionPhase(current, steps, fromIndex, {
          overflowMs,
          nowElapsedMs,
          completedPhaseMs,
          keepPaused: false,
        });
        batch.push({
          type: 'TRANSITION_STARTED',
          fromStepIndex: fromIndex,
          toStepIndex: nextIndex,
          suppressed: false,
        });
      } else if (nextIndex < steps.length) {
        current = startStepPhase(current, steps, nextIndex, {
          overflowMs,
          nowElapsedMs,
          completedPhaseMs,
          keepPaused: false,
        });
        batch.push({ type: 'STEP_STARTED', stepIndex: nextIndex, suppressed: false });
      } else {
        // The final step must still count towards the routine's elapsed time.
        current = completeSession({ ...current, completedPhaseMs }, nowElapsedMs);
        batch.push({ type: 'COMPLETED' });
      }
    } else {
      // Transition finished: enter the step it was preparing.
      const targetIndex = current.currentStepIndex;
      if (targetIndex >= steps.length) {
        current = completeSession({ ...current, completedPhaseMs }, nowElapsedMs);
        batch.push({ type: 'COMPLETED' });
      } else {
        current = startStepPhase(current, steps, targetIndex, {
          overflowMs,
          nowElapsedMs,
          completedPhaseMs,
          keepPaused: false,
        });
        batch.push({ type: 'STEP_STARTED', stepIndex: targetIndex, suppressed: false });
      }
    }

    batches.push(batch);
  }

  const lastBatchIndex = batches.length - 1;
  const events: RunnerEvent[] = [];
  batches.forEach((batch, batchIndex) => {
    const suppressed = batchIndex < lastBatchIndex;
    for (const event of batch) {
      events.push(
        event.type === 'COMPLETED' || event.type === 'STOPPED' ? event : { ...event, suppressed },
      );
    }
  });

  return { session: current, events, settled };
}

function applyPause(session: ActiveSession, nowElapsedMs: number): ActiveSession {
  if (!isRunning(session.state)) {
    return session;
  }
  return {
    ...session,
    state: togglePauseState(session.state),
    pausedAtElapsedMs: nowElapsedMs,
    lastUpdatedElapsedMs: nowElapsedMs,
  };
}

/**
 * Resume the exact prior phase by folding the pause length into
 * `accumulatedPauseMs`; `phaseStartedElapsedMs` never moves (PLAN §5 rule 5).
 */
function applyResume(session: ActiveSession, nowElapsedMs: number): ActiveSession {
  if (!isPaused(session.state)) {
    return session;
  }
  const pausedFor =
    session.pausedAtElapsedMs === null ? 0 : Math.max(0, nowElapsedMs - session.pausedAtElapsedMs);
  return {
    ...session,
    state: togglePauseState(session.state),
    pausedAtElapsedMs: null,
    accumulatedPauseMs: session.accumulatedPauseMs + pausedFor,
    lastUpdatedElapsedMs: nowElapsedMs,
  };
}

/** +10s: extend the current step at runtime only (SPEC US5 scenario 2). */
function applyAddTime(session: ActiveSession, nowElapsedMs: number, extensionMs: number): ActiveSession {
  if (session.state !== 'RUNNING_STEP' && session.state !== 'PAUSED_STEP') {
    return session;
  }
  const safeExtension = Math.max(0, Math.round(extensionMs));
  return {
    ...session,
    effectiveStepDurationMs: session.effectiveStepDurationMs + safeExtension,
    runtimeExtensionMs: session.runtimeExtensionMs + safeExtension,
    lastUpdatedElapsedMs: nowElapsedMs,
  };
}

/** Previous: restart the previous step at its full saved duration (PLAN §7). */
function applyPrevious(
  session: ActiveSession,
  steps: readonly RoutineStep[],
  nowElapsedMs: number,
): RunnerResult {
  const targetIndex = session.currentStepIndex - 1;
  if (targetIndex < 0) {
    // Defined no-op on the first step (SPEC edge cases).
    return { session, events: [], settled: [] };
  }
  // The abandoned phase settles its actual elapsed part first (a transition
  // settles nothing); the restarted step then accumulates afresh, and both
  // passes add up under the same ledger key.
  const abandoned = settleCurrentPhase(session, nowElapsedMs);
  const next = startStepPhase(abandoned.session, steps, targetIndex, {
    overflowMs: 0,
    nowElapsedMs,
    completedPhaseMs: plannedCompletedMsBefore(steps, targetIndex),
    keepPaused: isPaused(session.state),
  });
  return {
    session: next,
    events: [{ type: 'STEP_STARTED', stepIndex: targetIndex, suppressed: false }],
    settled: abandoned.settled ? [abandoned.settled] : [],
  };
}

/** Skip/Next: end the current phase now and move on (PLAN §7). */
function applySkip(
  session: ActiveSession,
  steps: readonly RoutineStep[],
  nowElapsedMs: number,
): RunnerResult {
  const keepPaused = isPaused(session.state);
  // A skipped step counts only the part actually run; a skipped transition
  // counts nothing ("stop waiting" is not action time).
  const abandoned = settleCurrentPhase(session, nowElapsedMs);
  const base = abandoned.session;
  const elapsedContribMs = phaseElapsedMs(base, nowElapsedMs);
  const completedPhaseMs = base.completedPhaseMs + elapsedContribMs;

  // Skipping during a transition means "stop waiting, start the prepared step".
  const targetIndex =
    base.state === 'RUNNING_TRANSITION' || base.state === 'PAUSED_TRANSITION'
      ? base.currentStepIndex
      : base.currentStepIndex + 1;

  if (targetIndex >= steps.length) {
    return {
      session: completeSession({ ...base, completedPhaseMs }, nowElapsedMs),
      events: [{ type: 'COMPLETED' }],
      settled: abandoned.settled ? [abandoned.settled] : [],
    };
  }

  const next = startStepPhase(base, steps, targetIndex, {
    overflowMs: 0,
    nowElapsedMs,
    completedPhaseMs,
    keepPaused,
  });
  return {
    session: next,
    events: [{ type: 'STEP_STARTED', stepIndex: targetIndex, suppressed: false }],
    settled: abandoned.settled ? [abandoned.settled] : [],
  };
}

/**
 * Apply a user control. Any pending boundary is resolved first, so a control
 * can never land on a stale phase.
 */
export function applyRunnerControl(
  session: ActiveSession,
  steps: readonly RoutineStep[],
  control: RunnerControl,
  nowElapsedMs: number,
): RunnerResult {
  const ticked = advanceRunner(session, steps, nowElapsedMs);
  const base = ticked.session;
  const events = [...ticked.events];
  const settled = [...ticked.settled];

  switch (control.type) {
    case 'PAUSE':
      return { session: applyPause(base, nowElapsedMs), events, settled };

    case 'RESUME': {
      const resumed = applyResume(base, nowElapsedMs);
      const afterResume = advanceRunner(resumed, steps, nowElapsedMs);
      return {
        session: afterResume.session,
        events: [...events, ...afterResume.events],
        settled: [...settled, ...afterResume.settled],
      };
    }

    case 'ADD_TIME':
      return { session: applyAddTime(base, nowElapsedMs, control.ms ?? ADD_TIME_MS), events, settled };

    case 'PREVIOUS': {
      if (!isActive(base.state)) {
        return { session: base, events, settled };
      }
      const result = applyPrevious(base, steps, nowElapsedMs);
      return { session: result.session, events: [...events, ...result.events], settled: [...settled, ...result.settled] };
    }

    case 'SKIP': {
      if (!isActive(base.state)) {
        return { session: base, events, settled };
      }
      const result = applySkip(base, steps, nowElapsedMs);
      return { session: result.session, events: [...events, ...result.events], settled: [...settled, ...result.settled] };
    }

    case 'END': {
      if (!isActive(base.state)) {
        return { session: base, events, settled };
      }
      // Stopping mid-phase counts the partial step time (HD-2=A); a
      // transition contributes nothing.
      const stopped = settleCurrentPhase(base, nowElapsedMs);
      return {
        session: stopSession(stopped.session, nowElapsedMs),
        events: [...events, { type: 'STOPPED' }],
        settled: [...settled, ...(stopped.settled ? [stopped.settled] : [])],
      };
    }

    default:
      return { session: base, events, settled };
  }
}
