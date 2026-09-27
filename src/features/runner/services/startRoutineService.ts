import type { ActiveSession } from '../../../domain/session/ActiveSession';
import type {
  RoutineRepository,
  RoutineWithSteps,
} from '../../../data/repositories/routineRepository';
import type { SessionRepository } from '../../../data/repositories/sessionRepository';
import type { SessionHistoryRepository } from '../../../data/repositories/sessionHistoryRepository';
import type { MonotonicClock, WallClock } from '../../../services/clock';
import type { BootInfoProvider } from '../../../services/runtime/BootInfo';
import { deviceTimezoneOffsetMin } from '../../../domain/statistics/history';
import { generateId, type IdGenerator } from '../../../shared/utils/id';
import { applyRunnerControl, startRunner, type RunnerEvent } from '../domain/runnerMachine';

/**
 * Single entry point for starting a routine (R014–R018).
 *
 * It centralises the whole decision:
 *   load active session -> conflict policy -> snapshot -> INSERT -> session.
 *
 * The result contract is fixed (R015):
 *   `started` | `continue-current` | `conflict` | `failed`.
 *
 * A second routine can never silently overwrite a running one: `start` returns
 * `conflict` and only `replaceWith`, called after an explicit user confirmation,
 * replaces the session.
 *
 * `started` / `continue-current` carry the cue events for the phase the user is
 * entering, so the caller can announce exactly once for an explicit action.
 * Automatic recovery does not go through this service and stays silent.
 */

export type StartResult =
  | { kind: 'started'; session: ActiveSession; events: RunnerEvent[] }
  | { kind: 'continue-current'; session: ActiveSession; events: RunnerEvent[] }
  | { kind: 'conflict'; current: ActiveSession }
  | { kind: 'failed'; error: string };

export interface StartRoutineServiceDeps {
  routines: Pick<RoutineRepository, 'getWithSteps'>;
  sessions: SessionRepository;
  monotonic: MonotonicClock;
  wallClock: WallClock;
  bootInfo: BootInfoProvider;
  /** Optional stats history (TASK-021-B1): durable loss notices on discard,
   * and archival of the replaced session before a new one starts (V1.3 DoD
   * 替换先归档旧场). */
  history?: Pick<SessionHistoryRepository, 'recordAnomaly' | 'archiveAndClear'>;
  generateId?: IdGenerator;
}

export interface StartRoutineService {
  /** Start or continue. Never overwrites a different running routine. */
  start(routineId: string): Promise<StartResult>;
  /** Explicitly continue whatever session is already active. */
  continueCurrent(): Promise<StartResult>;
  /** Explicit replace after the user chose "结束当前并开始新的". */
  replaceWith(routineId: string): Promise<StartResult>;
}

/**
 * Cue event for explicitly entering an already-running session (Continue).
 * Recovery stays silent, but an explicit "继续" must speak the current phase.
 */
export function buildResumeEvents(session: ActiveSession): RunnerEvent[] {
  switch (session.state) {
    case 'RUNNING_STEP':
    case 'PAUSED_STEP':
      return [{ type: 'STEP_STARTED', stepIndex: session.currentStepIndex, suppressed: false }];
    case 'RUNNING_TRANSITION':
    case 'PAUSED_TRANSITION':
      return [
        {
          type: 'TRANSITION_STARTED',
          fromStepIndex: Math.max(0, session.currentStepIndex - 1),
          toStepIndex: session.currentStepIndex,
          suppressed: false,
        },
      ];
    default:
      return [];
  }
}

export function createStartRoutineService(deps: StartRoutineServiceDeps): StartRoutineService {
  const nextId = deps.generateId ?? generateId;

  /**
   * A session owned by a previous boot cannot be resumed or continued (its
   * monotonic origin is gone). Drop it so a new start is not blocked by a dead
   * session; this mirrors the recovery fail-safe without announcing anything.
   */
  async function loadLiveSession(): Promise<ActiveSession | null> {
    const loaded = await deps.sessions.loadActive();
    if (loaded.status !== 'ok') {
      return null;
    }
    if (loaded.session.bootCount !== deps.bootInfo.getBootCount()) {
      // The elapsed origin is gone: whatever ran is uncountable and is never
      // guessed. Persist the anomalous loss BEFORE clearing; a failed notice
      // write keeps the row so the loss is not silent (V1.3 §3).
      try {
        await deps.history?.recordAnomaly('recovery-boot-changed', {
          sessionId: loaded.session.sessionId,
        });
      } catch {
        return null;
      }
      await deps.sessions.clear();
      return null;
    }
    return loaded.session;
  }

  function buildSession(routineId: string, loaded: RoutineWithSteps): {
    session: ActiveSession;
    events: RunnerEvent[];
  } {
    return startRunner({
      sessionId: nextId('ses'),
      routineId,
      routineName: loaded.routine.name,
      steps: loaded.steps,
      nowElapsedMs: deps.monotonic.nowElapsedMs(),
      wallMs: deps.wallClock.nowMs(),
      bootCount: deps.bootInfo.getBootCount(),
      // Frozen at start; later edits never rewrite a running session's type.
      trainingTypeId: loaded.routine.trainingTypeId ?? null,
    });
  }

  async function createNewSession(routineId: string): Promise<StartResult> {
    const loaded = await deps.routines.getWithSteps(routineId);
    if (!loaded) {
      return { kind: 'failed', error: '流程不存在' };
    }

    const { session, events } = buildSession(routineId, loaded);
    try {
      // INSERT, never `INSERT OR REPLACE`: the row must not already exist.
      await deps.sessions.create(session);
    } catch (error) {
      return { kind: 'failed', error: error instanceof Error ? error.message : '无法创建会话' };
    }
    return { kind: 'started', session, events };
  }

  /**
   * Dispose of the stored session before a replace, honoring the V1.3 DoD
   * 「替换先归档旧场」＋闸门③: a live old session is END-settled and handed
   * to `archiveAndClear` (counted time lands in history, expected exclusions
   * clear neutrally); a previous-boot session is uncountable and is recorded
   * as an anomalous loss first. Every path here either succeeds or KEEPS the
   * old row and throws — a failed notice/archive must never silently drop the
   * session, and the caller aborts the replace so no new session is created
   * while the old one is unresolved.
   */
  async function disposeReplacedSession(old: ActiveSession): Promise<void> {
    if (!deps.history) {
      // Stats history not wired (pre-stats builds / legacy test rigs): there
      // is nothing to archive, so keep the pre-B1 explicit-replace behavior.
      await deps.sessions.clear();
      return;
    }
    if (old.bootCount !== deps.bootInfo.getBootCount()) {
      // The elapsed origin is gone: whatever ran is uncountable and is never
      // guessed. Persist the anomalous loss BEFORE clearing; a failed notice
      // write keeps the row so the loss is not silent (V1.3 §3).
      await deps.history?.recordAnomaly('recovery-boot-changed', {
        sessionId: old.sessionId,
      });
      await deps.sessions.clear();
      return;
    }
    // Same boot: settle the run honestly. END counts the partial phase and
    // marks STOPPED; the archive then decides (counted / expected exclusion).
    const nowElapsedMs = deps.monotonic.nowElapsedMs();
    const settled = applyRunnerControl(old, old.snapshot.steps, { type: 'END' }, nowElapsedMs)
      .session;
    const endWallMs = deps.wallClock.nowMs();
    await deps.history?.archiveAndClear(settled, {
      endWallMs,
      endTimezoneOffsetMin: deviceTimezoneOffsetMin(endWallMs),
    });
  }

  return {
    async start(routineId: string): Promise<StartResult> {
      try {
        const current = await loadLiveSession();
        if (current) {
          if (current.routineId === routineId) {
            return { kind: 'continue-current', session: current, events: buildResumeEvents(current) };
          }
          return { kind: 'conflict', current };
        }
        return await createNewSession(routineId);
      } catch (error) {
        return { kind: 'failed', error: error instanceof Error ? error.message : '无法开始流程' };
      }
    },

    async continueCurrent(): Promise<StartResult> {
      try {
        const current = await loadLiveSession();
        if (!current) {
          return { kind: 'failed', error: '没有可继续的流程' };
        }
        return { kind: 'continue-current', session: current, events: buildResumeEvents(current) };
      } catch (error) {
        return { kind: 'failed', error: error instanceof Error ? error.message : '无法继续流程' };
      }
    },

    async replaceWith(routineId: string): Promise<StartResult> {
      try {
        const loaded = await deps.routines.getWithSteps(routineId);
        if (!loaded) {
          return { kind: 'failed', error: '流程不存在' };
        }

        // V1.3 DoD「替换先归档旧场」: the old session is settled and archived
        // (or accounted for as an anomalous loss) BEFORE the new one exists.
        // Any failure keeps the old row and aborts — no unarchived gap, and
        // never "old lost + new not created".
        const current = await deps.sessions.loadActive();
        if (current.status === 'ok') {
          await disposeReplacedSession(current.session);
        }
        // `corrupt`: the row is already gone (repository fail-safe).

        const { session, events } = buildSession(routineId, loaded);
        await deps.sessions.create(session);
        return { kind: 'started', session, events };
      } catch (error) {
        return { kind: 'failed', error: error instanceof Error ? error.message : '无法开始流程' };
      }
    },
  };
}
