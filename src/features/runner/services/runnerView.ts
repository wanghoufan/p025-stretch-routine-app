import { isPaused } from '../../../domain/session/RunnerState';
import type { RoutineStep } from '../../../domain/routine/RoutineStep';
import type { RunnerSnapshot } from './runnerController';
import {
  currentStep,
  previousStep,
  phaseElapsedMs,
  remainingMs,
  routineElapsedMs,
  routineProgress,
  routineTotalMs,
  upcomingStep,
} from '../domain/runnerTime';

/** Everything the Runner screen needs, derived from an immutable snapshot. */
export interface RunnerView {
  status: RunnerSnapshot['status'];
  /** Provenance id (may reference a deleted routine). */
  routineId: string | null;
  /** Name captured in the session snapshot; survives source rename/delete. */
  routineName: string | null;
  steps: readonly RoutineStep[];
  nowElapsedMs: number;
  errorMessage: string | null;

  currentStep: RoutineStep | undefined;
  nextStep: RoutineStep | undefined;
  /** The step being prepared while a transition runs. */
  transitionTarget: RoutineStep | undefined;
  /** The step that just finished, while a transition runs. */
  finishedStep: RoutineStep | undefined;

  remainingMs: number;
  elapsedMs: number;
  totalMs: number;
  progress: number;

  /**
   * TASK-021-B4 (HD-6): actual action time settled so far — the same ledger
   * the statistics archive stores, plus the still-running step phase.
   * Excludes pauses and transitions; 0 for pre-upgrade sessions.
   */
  statsActionMs: number;
  /** Terminal-archive outcome; see RunnerSnapshot.terminalOutcome. */
  terminalOutcome: RunnerSnapshot['terminalOutcome'];

  isPaused: boolean;
  isTransition: boolean;
  canGoPrevious: boolean;
  canAddTime: boolean;
  /** 1-based position for display, e.g. `2 / 5`. */
  stepPosition: number;
  stepCount: number;
  /** True once the routine reached a terminal state. */
  isFinished: boolean;
  isStopped: boolean;
}

export function deriveRunnerView(snapshot: RunnerSnapshot): RunnerView {
  const { session, steps, nowElapsedMs } = snapshot;
  const empty: RunnerView = {
    status: snapshot.status,
    routineId: session?.routineId ?? null,
    routineName: snapshot.routineName,
    steps,
    nowElapsedMs,
    errorMessage: snapshot.errorMessage,
    currentStep: undefined,
    nextStep: undefined,
    transitionTarget: undefined,
    finishedStep: undefined,
    remainingMs: 0,
    elapsedMs: 0,
    totalMs: routineTotalMs(steps),
    progress: 0,
    statsActionMs: 0,
    terminalOutcome: null,
    isPaused: false,
    isTransition: false,
    canGoPrevious: false,
    canAddTime: false,
    stepPosition: 0,
    stepCount: steps.length,
    isFinished: false,
    isStopped: false,
  };

  if (!session) {
    return empty;
  }

  const isTransition =
    session.state === 'RUNNING_TRANSITION' || session.state === 'PAUSED_TRANSITION';
  const isStepPhase = session.state === 'RUNNING_STEP' || session.state === 'PAUSED_STEP';

  return {
    ...empty,
    currentStep: currentStep(steps, session),
    nextStep: upcomingStep(steps, session),
    transitionTarget: isTransition ? steps[session.currentStepIndex] : undefined,
    finishedStep: isTransition ? previousStep(steps, session) : undefined,
    remainingMs: remainingMs(session, nowElapsedMs),
    elapsedMs: routineElapsedMs(session, nowElapsedMs),
    progress: routineProgress(session, steps, nowElapsedMs),
    // Pre-upgrade rows are never accounted (V1.3 §3), so gate on eligibility.
    statsActionMs: session.statsEligible
      ? session.statsTotalStepMs + (isStepPhase ? phaseElapsedMs(session, nowElapsedMs) : 0)
      : 0,
    terminalOutcome: snapshot.terminalOutcome,
    isPaused: isPaused(session.state),
    isTransition,
    canGoPrevious: session.currentStepIndex > 0,
    canAddTime: isStepPhase,
    stepPosition: steps.length === 0 ? 0 : session.currentStepIndex + 1,
    stepCount: steps.length,
    isFinished: session.state === 'COMPLETED',
    isStopped: session.state === 'STOPPED' || session.state === 'ERROR',
  };
}
