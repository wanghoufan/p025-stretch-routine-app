import type { ActiveSession } from '../../../domain/session/ActiveSession';
import { phaseElapsedMs, phaseTotalMs } from './runnerTime';

/**
 * Actual-action-time settlement (TASK-021-B1, HD-2/HD-6).
 *
 * `completedPhaseMs` cannot back statistics: it includes transitions and
 * `Previous` overwrites it with *planned* values. Statistics therefore settle
 * every step phase separately, exactly once, from the same monotonic phase
 * functions the runner itself uses:
 *
 * - a step phase that ends at its boundary contributes its full effective
 *   duration (runtime +10s included — the user really ran it);
 * - a step phase abandoned mid-way (Skip / Previous / End) contributes the
 *   elapsed part at that moment, clamped to the phase length;
 * - transition phases contribute nothing (HD-6: 暂停与转场不计);
 * - pauses contribute nothing, because `phaseElapsedMs` already folds
 *   `accumulatedPauseMs` in.
 *
 * Settlement happens *inside* the runner machine transitions, so every machine
 * result carries an updated ledger and the numbers can never be consumed twice
 * or forgotten — there is no separate "consumer" step. The per-step ledger is
 * keyed by step index: re-running a step via Previous adds to the same key, so
 * `sum(ledger) === statsTotalStepMs` always holds and the archive can write
 * one detail row per step.
 */

/** Actual action ms contributed by one step phase, settled exactly once. */
export interface SettledSegment {
  stepIndex: number;
  ms: number;
}

/**
 * Compute the segment the *current* phase contributes when it ends right now.
 * Returns null for transition phases (nothing to count) and for ineligible
 * sessions (pre-upgrade rows are never accounted, V1.3 §3).
 */
export function settledSegmentForCurrentPhase(
  session: ActiveSession,
  nowElapsedMs: number,
): SettledSegment | null {
  if (!session.statsEligible) {
    return null;
  }
  if (session.state !== 'RUNNING_STEP' && session.state !== 'PAUSED_STEP') {
    return null;
  }
  const elapsed = phaseElapsedMs(session, nowElapsedMs);
  const ms = Math.max(0, Math.min(elapsed, phaseTotalMs(session)));
  return { stepIndex: session.currentStepIndex, ms };
}

/**
 * Fold one settled segment into the session's stats ledger. Total and per-step
 * entry move together, which is what keeps `sum(明细) === 总计` an invariant
 * rather than a hope. `ms <= 0` is a no-op (nothing ran).
 */
export function applySettlement(
  session: ActiveSession,
  segment: SettledSegment | null,
): ActiveSession {
  if (!segment || segment.ms <= 0) {
    return session;
  }
  const key = String(segment.stepIndex);
  return {
    ...session,
    statsTotalStepMs: session.statsTotalStepMs + segment.ms,
    statsStepLedger: {
      ...session.statsStepLedger,
      [key]: (session.statsStepLedger[key] ?? 0) + segment.ms,
    },
  };
}

/**
 * Settle the current step phase (if any) and return the updated session.
 * Used wherever a phase is abandoned early: Skip, Previous, End.
 */
export function settleCurrentPhase(
  session: ActiveSession,
  nowElapsedMs: number,
): { session: ActiveSession; settled: SettledSegment | null } {
  const segment = settledSegmentForCurrentPhase(session, nowElapsedMs);
  return { session: applySettlement(session, segment), settled: segment };
}

/**
 * Settle a step phase that ran to its boundary: the machine has already
 * resolved the boundary, so the phase's full effective duration really ran
 * (background overflow belongs to the *next* phase, which is clamped when it
 * settles in turn).
 */
export function settleCompletedPhase(session: ActiveSession): {
  session: ActiveSession;
  settled: SettledSegment | null;
} {
  if (!session.statsEligible || session.state !== 'RUNNING_STEP') {
    return { session, settled: null };
  }
  const segment: SettledSegment = {
    stepIndex: session.currentStepIndex,
    ms: phaseTotalMs(session),
  };
  return { session: applySettlement(session, segment), settled: segment };
}
