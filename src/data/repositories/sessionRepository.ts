import type { ActiveSession } from '../../domain/session/ActiveSession';
import type { SqlDatabase, SqlParams } from '../db/Database';
import { rowToActiveSession, type ActiveSessionRow } from '../mappers/sessionMapper';
import { PersistenceError } from '../../shared/errors';

/**
 * Persistence for the single authoritative active session (R011).
 *
 * Write paths are deliberately separated:
 *  - `create`  -> `INSERT` for a brand-new session (no silent overwrite);
 *  - `save`    -> `UPDATE` the existing singleton row;
 *  - `replace` -> explicit, user-confirmed conflict resolution only.
 *
 * There is **no unconditional `INSERT OR REPLACE`**: starting a second routine
 * can never silently overwrite an in-flight one.
 *
 * Reads are fail-safe: an unreadable/unknown/corrupt payload is reported and the
 * row is cleared so it can never be resumed (R011, R013).
 */

export type ActiveSessionLoad =
  | { status: 'none' }
  | { status: 'ok'; session: ActiveSession }
  | { status: 'corrupt'; reason: string };

export interface SessionRepository {
  loadActive(): Promise<ActiveSessionLoad>;
  /** INSERT a new session. Throws if a row already exists. */
  create(session: ActiveSession): Promise<void>;
  /** UPDATE the existing session. Throws if no row exists. */
  save(session: ActiveSession): Promise<void>;
  /**
   * Explicit replace (DELETE + INSERT) after a confirmed conflict choice.
   * Low-level primitive only: it does NOT archive the replaced session, so
   * the user-facing replace flow (`StartRoutineService.replaceWith`) must go
   * through the history archive first and never call this for a live session.
   */
  replace(session: ActiveSession): Promise<void>;
  clear(): Promise<void>;
}

const INSERT_SQL = `INSERT INTO active_session
  (id, session_id, routine_id, routine_name, state, current_step_index,
   phase_started_elapsed_ms, paused_at_elapsed_ms, accumulated_pause_ms,
   effective_step_duration_ms, effective_transition_duration_ms, runtime_extension_ms,
   completed_phase_ms, last_updated_elapsed_ms, updated_at_wall_ms, boot_count,
   training_type_id, stats_eligible, stats_total_step_ms, stats_step_ledger_json,
   snapshot_version, snapshot)
 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const UPDATE_SQL = `UPDATE active_session SET
   session_id = ?, routine_id = ?, routine_name = ?, state = ?, current_step_index = ?,
   phase_started_elapsed_ms = ?, paused_at_elapsed_ms = ?, accumulated_pause_ms = ?,
   effective_step_duration_ms = ?, effective_transition_duration_ms = ?, runtime_extension_ms = ?,
   completed_phase_ms = ?, last_updated_elapsed_ms = ?, updated_at_wall_ms = ?, boot_count = ?,
   training_type_id = ?, stats_eligible = ?, stats_total_step_ms = ?, stats_step_ledger_json = ?,
   snapshot_version = ?, snapshot = ?
 WHERE id = 1`;

function toParams(session: ActiveSession): SqlParams {
  return [
    session.sessionId,
    session.routineId,
    session.routineName,
    session.state,
    session.currentStepIndex,
    session.phaseStartedElapsedMs,
    session.pausedAtElapsedMs,
    session.accumulatedPauseMs,
    session.effectiveStepDurationMs,
    session.effectiveTransitionDurationMs,
    session.runtimeExtensionMs,
    session.completedPhaseMs,
    session.lastUpdatedElapsedMs,
    session.updatedAtWallMs,
    session.bootCount,
    session.trainingTypeId,
    session.statsEligible ? 1 : 0,
    session.statsTotalStepMs,
    JSON.stringify(session.statsStepLedger ?? {}),
    session.snapshotVersion,
    JSON.stringify(session.snapshot),
  ];
}

export function createSessionRepository(db: SqlDatabase): SessionRepository {
  async function clearRow(): Promise<void> {
    await db.run('DELETE FROM active_session WHERE id = 1');
  }

  return {
    async loadActive(): Promise<ActiveSessionLoad> {
      const row = await db.get<ActiveSessionRow>('SELECT * FROM active_session WHERE id = 1');
      if (!row) {
        return { status: 'none' };
      }

      const result = rowToActiveSession(row);
      if (result.status === 'corrupt') {
        // Fail-safe: a session we cannot trust must not be resumed.
        await clearRow();
        return { status: 'corrupt', reason: result.reason };
      }
      return { status: 'ok', session: result.session };
    },

    async create(session: ActiveSession): Promise<void> {
      try {
        await db.run(INSERT_SQL, toParams(session));
      } catch (error) {
        throw new PersistenceError('创建活动会话失败（已存在活动会话？）', error);
      }
    },

    async save(session: ActiveSession): Promise<void> {
      await db.run(UPDATE_SQL, toParams(session));
      const existing = await db.get<{ id: number }>('SELECT id FROM active_session WHERE id = 1');
      if (!existing) {
        throw new PersistenceError('更新活动会话失败：没有可更新的活动会话');
      }
    },

    async replace(session: ActiveSession): Promise<void> {
      await db.transaction(async () => {
        await clearRow();
        await db.run(INSERT_SQL, toParams(session));
      });
    },

    async clear(): Promise<void> {
      await clearRow();
    },
  };
}
