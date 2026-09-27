import type { ActiveSession } from '../session/ActiveSession';
import { isTerminal } from '../session/RunnerState';

/**
 * Domain model for the local session history (TASK-021-B1, V1.3 HD-1~HD-6).
 *
 * Everything in this module is pure: the repository translates these values
 * into SQL, the archive service feeds them wall-clock inputs. Nothing here
 * reads a clock, so the date arithmetic and terminal classification stay
 * deterministic and unit-testable.
 */

/** Display data of one row of the `training_types` table (HD-1/HD-5). */
export interface TrainingTypeInfo {
  typeId: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
  isBuiltin: boolean;
  isActive: boolean;
}

/**
 * One archived session (one row of `session_history`).
 *
 * `trainingTypeId === null` is the 未分类 bucket: the sum of all type buckets
 * plus the null bucket always equals the grand total (HD-1=B).
 */
export interface SessionHistoryRecord {
  /** Idempotency key: archiving the same session twice stores one row. */
  sessionId: string;
  /** Provenance only; the routine may have been edited or deleted since. */
  routineId: string;
  /** Name snapshot captured at start; survives renames and deletion. */
  routineName: string;
  /** Type snapshot frozen at start; null = unclassified. */
  trainingTypeId: string | null;
  /** Wall-clock ms at session start (from the immutable snapshot). */
  startedAtWallMs: number;
  /** Wall-clock ms at the terminal event. Never used for durations. */
  endedAtWallMs: number;
  /** Local calendar date (YYYY-MM-DD) of `endedAtWallMs`; whole session belongs to it. */
  endLocalDate: string;
  /** Device UTC offset (JS `getTimezoneOffset()` semantics) at the end moment. */
  endUtcOffsetMin: number;
  /** Actual action time (monotonic-derived); excludes pauses and transitions. */
  totalStepMs: number;
  endState: 'COMPLETED' | 'STOPPED';
  /** STOPPED sessions that counted are always "ended early" (HD-2=A). */
  endedEarly: boolean;
}

/** One actually-run step of an archived session (`session_history_steps`). */
export interface SessionHistoryStepDetail {
  stepIndex: number;
  stepId: string | null;
  /** Name snapshot; survives step edits and routine deletion. */
  stepName: string;
  trainingTypeId: string | null;
  /** Actual run time of this step across every pass (Previous re-runs add up). */
  effectiveMs: number;
}

/**
 * Why a terminal session was NOT archived. Closed by design: anything outside
 * this enumeration is an anomalous loss and must produce a persisted
 * `stats_anomaly_notice` row instead of a neutral note (Round 2 P1-C).
 */
export type ArchiveExclusionReason =
  /** Session started before the stats upgrade; never back-filled. */
  | 'session-not-eligible'
  /** Runner marked the session ERROR; untrusted, not counted. */
  | 'terminal-error'
  /** The user stopped before any action time accumulated. */
  | 'no-action-time';

export type TerminalClassification =
  | { kind: 'archive'; endState: 'COMPLETED' | 'STOPPED'; endedEarly: boolean }
  | { kind: 'excluded'; reason: ArchiveExclusionReason }
  | { kind: 'not-terminal' };

/** Result of the archive entry point (see SessionHistoryRepository). */
export type ArchiveOutcome =
  | { kind: 'archived'; record: SessionHistoryRecord }
  | { kind: 'excluded'; reason: ArchiveExclusionReason }
  | { kind: 'not-terminal' }
  | { kind: 'wall-date-untrusted' };

/**
 * Serializable archive status the completion screen explains (TASK-021-B4).
 * `failed` is retryable (the archive transaction keeps the stored row); a
 * `wall-date-untrusted` loss is not (the row is gone, the anomaly notice is
 * persisted and the Stats caveat explains it).
 */
export type CompletionOutcome =
  | { status: 'archived' }
  | { status: 'excluded'; reason: ArchiveExclusionReason }
  | { status: 'wall-date-untrusted' }
  | { status: 'failed' };

/**
 * Terminal-state classification (V1.3 §3 implementation gate ③).
 *
 * COMPLETED counts; STOPPED counts only with actual action time > 0 and is
 * flagged "ended early"; ERROR / ineligible / 0ms sessions are expected
 * exclusions with neutral explanations — they never become anomaly notices.
 */
export function classifyTerminalSession(session: ActiveSession): TerminalClassification {
  if (!isTerminal(session.state)) {
    return { kind: 'not-terminal' };
  }
  if (session.state === 'ERROR') {
    return { kind: 'excluded', reason: 'terminal-error' };
  }
  if (!session.statsEligible) {
    return { kind: 'excluded', reason: 'session-not-eligible' };
  }
  if (session.statsTotalStepMs <= 0) {
    return { kind: 'excluded', reason: 'no-action-time' };
  }
  return {
    kind: 'archive',
    endState: session.state === 'COMPLETED' ? 'COMPLETED' : 'STOPPED',
    endedEarly: session.state === 'STOPPED',
  };
}

/**
 * Local calendar date of a wall timestamp, pure arithmetic.
 *
 * `timezoneOffsetMin` uses JS `Date#getTimezoneOffset()` semantics (UTC minus
 * local, in minutes; UTC+8 → -480). Shifting the instant by the offset and
 * reading its UTC components yields the device-local Y/M/D without touching
 * `Intl`, whose Hermes implementation must not be a data dependency (V1.3 §3).
 * Cross-midnight sessions therefore land entirely on the end date, and a later
 * timezone change never re-dates stored rows (the offset is frozen per row).
 */
export function localDateFromWallMs(wallMs: number, timezoneOffsetMin: number): string {
  const shifted = new Date(wallMs - timezoneOffsetMin * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Device UTC offset (JS semantics) for a wall timestamp. Kept next to the pure
 * arithmetic so production and tests share one definition of the convention.
 */
export function deviceTimezoneOffsetMin(wallMs: number): number {
  return new Date(wallMs).getTimezoneOffset();
}

/**
 * Durable anomaly reasons (V1.3 §3: 载体 `stats_anomaly_notice`). Expected
 * exclusions (see `ArchiveExclusionReason`) must NOT be recorded here.
 */
export type StatsAnomalyReasonCode =
  | 'recovery-boot-changed'
  | 'recovery-stale'
  | 'recovery-corrupt'
  | 'archive-failed'
  /** Wall clock moved backwards during the session (ended < started): the
   * local end date would be a guess, so the session is not archived and the
   * counted time is reported as an anomalous loss instead (V1.3 §3 不猜). */
  | 'wall-date-untrusted';

/**
 * Map a recovery discard reason onto an anomaly code. Recovery discards are
 * anomalous losses by definition (the session's remaining time is not counted
 * and never guessed); a stored terminal row means an earlier archive failed.
 */
export function anomalyCodeFromRecoveryReason(reason: string): StatsAnomalyReasonCode {
  if (reason === 'boot count changed') {
    return 'recovery-boot-changed';
  }
  if (reason === 'session is stale') {
    return 'recovery-stale';
  }
  if (reason === 'stored session is not active') {
    return 'archive-failed';
  }
  return 'recovery-corrupt';
}

export interface StatsAnomalyNotice {
  id: number;
  reasonCode: StatsAnomalyReasonCode;
  occurredAtWallMs: number;
  sessionId: string | null;
  dismissedAtWallMs: number | null;
}
