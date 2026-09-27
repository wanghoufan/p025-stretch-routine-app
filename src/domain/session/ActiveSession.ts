import type { RunnerState } from './RunnerState';
import type { ActiveSessionSnapshot } from './SessionSnapshot';

/**
 * The authoritative state required to continue a running routine
 * (PRODUCT_PLAN_V1.2 Data/API — ActiveSession V2; R009).
 *
 * Binding rules:
 * 1. Remaining time is computed from **monotonic elapsed** timestamps, never
 *    from a counter and never from the wall clock (R007/R012).
 * 2. UI tick frequency is presentation only.
 * 3. TTS callbacks never advance time.
 * 4. Pause freezes effective elapsed time via `accumulatedPauseMs`.
 * 5. Resume extends `accumulatedPauseMs`; `phaseStartedElapsedMs` never moves.
 * 6. Background/foreground reconstruction reads this record only.
 * 7. Playback content comes exclusively from `snapshot`; the source Routine is
 *    never consulted after start (R019/R021).
 *
 * Field semantics:
 * - `*ElapsedMs` values are monotonic ms since boot (`MonotonicClock`).
 * - `updatedAtWallMs` is a real-world timestamp for display/age only; it never
 *   influences countdowns, so a wall-clock jump cannot move the timer.
 * - `bootCount` identifies the process/boot that owns the elapsed origin; a
 *   mismatch means the elapsed values are meaningless and must not be used.
 */
export interface ActiveSession {
  sessionId: string;
  /** Provenance only. May point to a routine that has since been deleted. */
  routineId: string;
  /** Display name captured at start; survives source rename/deletion. */
  routineName: string;

  state: RunnerState;
  /**
   * Index into the snapshot's ordered steps.
   *
   * During a transition this is the index of the *upcoming* step, so the
   * runner can show "下一个" while the transition counts down.
   */
  currentStepIndex: number;

  /** Monotonic ms when the current phase (step or transition) started. */
  phaseStartedElapsedMs: number | null;
  /** Monotonic ms at pause; null while running. */
  pausedAtElapsedMs: number | null;
  /** Total completed pause time earlier in this routine. */
  accumulatedPauseMs: number;

  effectiveStepDurationMs: number;
  effectiveTransitionDurationMs: number;

  /** Runtime-only extension (e.g. +10s). Never written back to the routine. */
  runtimeExtensionMs: number;

  /** Routine time already finished before the current phase. */
  completedPhaseMs: number;

  /** Monotonic ms of the last authoritative write; used for same-boot age. */
  lastUpdatedElapsedMs: number;
  /** Wall-clock ms of the last write; display/age only, never timing. */
  updatedAtWallMs: number;

  /** Boot that owns the elapsed origin (`BootInfoProvider`). */
  bootCount: number;

  /**
   * Training type frozen at session start (TASK-021-B1, HD-1/HD-5).
   * `null` = 未分类. A never-mutated snapshot scalar, not a live link.
   */
  trainingTypeId: string | null;

  /**
   * Stats accounting (TASK-021-B1). `false` only for sessions stored by a
   * pre-stats build: they stay resumable but are never back-filled.
   */
  statsEligible: boolean;
  /**
   * Actual action time settled so far (monotonic sum; excludes pauses and
   * transitions). Only grows.
   */
  statsTotalStepMs: number;
  /**
   * Per-step settled actual ms keyed by step index (stringified for JSON
   * round-trips). Numbers only — the snapshot stays the single source of the
   * playback content. `sum(values) === statsTotalStepMs` always holds.
   */
  statsStepLedger: Record<string, number>;

  /** Version of the snapshot payload; validated on decode. */
  snapshotVersion: number;
  /** Immutable playback content captured at start. */
  snapshot: ActiveSessionSnapshot;
}
