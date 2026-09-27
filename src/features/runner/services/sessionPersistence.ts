import type { ActiveSession } from '../../../domain/session/ActiveSession';
import { isActive } from '../../../domain/session/RunnerState';
import {
  deviceTimezoneOffsetMin,
  type ArchiveExclusionReason,
} from '../../../domain/statistics/history';
import type { ActiveSessionLoad, SessionRepository } from '../../../data/repositories/sessionRepository';
import type { SessionHistoryRepository } from '../../../data/repositories/sessionHistoryRepository';
import type { WallClock } from '../../../services/clock';

/**
 * Writes the authoritative session so it can be reconstructed later (R011).
 *
 * Only live phases are worth persisting as-is: when a routine reaches a
 * terminal state the row is handed to the history archive, which inserts the
 * `session_history` record(s) and clears the row in ONE transaction
 * (TASK-021-B1). An archive failure keeps the row (the transaction rolled
 * back) so the terminal session stays retryable instead of being silently
 * dropped — the completion screen's retry entry is wired in TASK-021-B4 via
 * `archiveTerminal`, which propagates the failure instead of swallowing it.
 *
 * The row is created by `StartRoutineService` with an explicit `INSERT`; this
 * layer only ever `UPDATE`s (or archives/clears) it, so a running session can
 * never be silently replaced by a later write.
 */
export interface SessionPersistenceOptions {
  repository: SessionRepository;
  /** Refreshes the display-only wall timestamp; never used for timing. */
  wallClock: WallClock;
  /** History archive for terminal sessions; plain clear() when absent. */
  history?: Pick<SessionHistoryRepository, 'archiveAndClear'>;
  onError?: (error: unknown) => void;
}

/**
 * Archive result without the stored record (the completion UI never reads it).
 */
export type TerminalArchiveOutcome =
  | { kind: 'archived' }
  | { kind: 'excluded'; reason: ArchiveExclusionReason }
  | { kind: 'not-terminal' }
  | { kind: 'wall-date-untrusted' };

export interface SessionPersistence {
  /** Persist the current session, or clear it when it is terminal. Never throws. */
  save(session: ActiveSession): Promise<void>;
  /**
   * Terminal-only archive that PROPAGATES failures (TASK-021-B4): the caller
   * turns an exception into the retryable outcome instead of a silent loss.
   * The active row is untouched when this throws (transaction rollback).
   */
  archiveTerminal(session: ActiveSession): Promise<TerminalArchiveOutcome>;
  clear(): Promise<void>;
  load(): Promise<ActiveSessionLoad>;
}

export function shouldPersistSession(state: ActiveSession['state']): boolean {
  return isActive(state);
}

export function createSessionPersistence(options: SessionPersistenceOptions): SessionPersistence {
  const { repository, wallClock, history, onError } = options;

  /**
   * Shared terminal entry point. The terminal session (with its final settled
   * ledger) is written to the row FIRST: if the archive then fails, the retry
   * entry and the recovery path see the terminal state, not a stale live
   * phase. Without a history archive (legacy test wiring only — production
   * always has one) the behaviour stays the pre-B1 plain clear.
   */
  async function archiveTerminal(session: ActiveSession): Promise<TerminalArchiveOutcome> {
    await repository.save({ ...session, updatedAtWallMs: wallClock.nowMs() });
    if (!history) {
      await repository.clear();
      return { kind: 'archived' };
    }
    const endWallMs = wallClock.nowMs();
    return history.archiveAndClear(session, {
      endWallMs,
      endTimezoneOffsetMin: deviceTimezoneOffsetMin(endWallMs),
    });
  }

  return {
    async save(session: ActiveSession): Promise<void> {
      try {
        if (!shouldPersistSession(session.state)) {
          await archiveTerminal(session);
          return;
        }
        await repository.save({ ...session, updatedAtWallMs: wallClock.nowMs() });
      } catch (error) {
        onError?.(error);
      }
    },

    archiveTerminal,

    async clear(): Promise<void> {
      try {
        await repository.clear();
      } catch (error) {
        onError?.(error);
      }
    },

    async load(): Promise<ActiveSessionLoad> {
      try {
        return await repository.loadActive();
      } catch (error) {
        onError?.(error);
        return { status: 'none' };
      }
    },
  };
}
