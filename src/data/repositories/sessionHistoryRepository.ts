import type { ActiveSession } from '../../domain/session/ActiveSession';
import {
  classifyTerminalSession,
  deviceTimezoneOffsetMin,
  localDateFromWallMs,
  type SessionHistoryRecord,
  type SessionHistoryStepDetail,
  type StatsAnomalyNotice,
  type StatsAnomalyReasonCode,
  type TrainingTypeInfo,
  type ArchiveOutcome,
} from '../../domain/statistics/history';
import type { SqlDatabase, SqlParams } from '../db/Database';
import { PersistenceError } from '../../shared/errors';

/**
 * Local session history: archive, query, delete (TASK-021-B1, V1.3 §3).
 *
 * `archiveAndClear` is the single terminal entry point:
 *
 * - **atomic** — inserting the history row(s) and clearing `active_session`
 *   share one transaction, so a failure leaves the session resumable and
 *   stores nothing (the caller can retry);
 * - **idempotent** — `session_id` is the primary key; a retried archive of the
 *   same session finds the existing row and skips the inserts, so double
 *   invocation never double-counts;
 * - **classified** — COMPLETED archives; STOPPED archives only with actual
 *   action time > 0 (flagged "ended early"); ERROR / pre-upgrade / 0ms are
 *   expected exclusions that still clear the dead row but never write an
 *   anomaly notice (the anomaly table is for anomalous losses only);
 * - **date-honest** — a wall clock that moved backwards (end < start) makes
 *   the end date a guess, so the session is NOT archived and the loss is
 *   persisted as a `wall-date-untrusted` anomaly notice instead (V1.3 §3).
 *
 * The wall clock enters only through the caller-supplied `endWallMs` and the
 * frozen per-row UTC offset; durations come exclusively from the monotonic
 * ledger, so clock changes can shift a displayed date but never a duration.
 */

export interface ArchiveInput {
  /** Wall-clock ms of the terminal event (display/date only, never timing). */
  endWallMs: number;
  /**
   * Device UTC offset (`Date#getTimezoneOffset()` semantics) at the end
   * moment. Injectable so tests can pin cross-midnight and timezone changes.
   */
  endTimezoneOffsetMin?: number;
}

export interface SessionTotals {
  totalStepMs: number;
  sessionCount: number;
}

export interface SessionTypeTotals {
  /** `null` is the 未分类 bucket; the sum of all buckets equals the total. */
  trainingTypeId: string | null;
  totalStepMs: number;
  sessionCount: number;
}

export interface SessionHistoryRepository {
  archiveAndClear(session: ActiveSession, input: ArchiveInput): Promise<ArchiveOutcome>;
  listTrainingTypes(): Promise<TrainingTypeInfo[]>;
  getTotals(): Promise<SessionTotals>;
  getTotalsByType(): Promise<SessionTypeTotals[]>;
  /** Most recent records, stable order: time DESC then session id DESC. */
  getRecent(limit: number): Promise<SessionHistoryRecord[]>;
  getStepDetails(sessionId: string): Promise<SessionHistoryStepDetail[]>;
  /** Delete one record and its step details. Returns false when absent. */
  deleteRecord(sessionId: string): Promise<boolean>;
  /**
   * Clear history, step details and anomaly notices. Deliberately touches
   * nothing else: routines, actions, the active session and the seed markers
   * (`seed_version` / `seed_examples_cleared`) are user data, not statistics
   * (HD-4: strict isolation from 清除示范数据).
   */
  clearAllStats(): Promise<void>;
  recordAnomaly(
    reasonCode: StatsAnomalyReasonCode,
    options?: { sessionId?: string | null; wallMs?: number },
  ): Promise<void>;
  listActiveAnomalies(): Promise<StatsAnomalyNotice[]>;
  dismissAllAnomalies(wallMs: number): Promise<void>;
}

const HISTORY_COLUMNS = `session_id, routine_id, routine_name, training_type_id,
  started_at_wall_ms, ended_at_wall_ms, end_local_date, end_utc_offset_min,
  total_step_ms, end_state, ended_early, archived_at_wall_ms`;

interface SessionHistoryRow {
  session_id: string;
  routine_id: string;
  routine_name: string;
  training_type_id: string | null;
  started_at_wall_ms: number;
  ended_at_wall_ms: number;
  end_local_date: string;
  end_utc_offset_min: number;
  total_step_ms: number;
  end_state: string;
  ended_early: number;
  archived_at_wall_ms: number;
}

function toRecord(row: SessionHistoryRow): SessionHistoryRecord {
  return {
    sessionId: row.session_id,
    routineId: row.routine_id,
    routineName: row.routine_name,
    trainingTypeId: row.training_type_id,
    startedAtWallMs: row.started_at_wall_ms,
    endedAtWallMs: row.ended_at_wall_ms,
    endLocalDate: row.end_local_date,
    endUtcOffsetMin: row.end_utc_offset_min,
    totalStepMs: row.total_step_ms,
    endState: row.end_state === 'STOPPED' ? 'STOPPED' : 'COMPLETED',
    endedEarly: row.ended_early === 1,
  };
}

/**
 * Per-step detail rows from the stats ledger. Steps with zero settled time are
 * omitted (they contribute nothing, and `sum(details) === total` still holds);
 * indices without a snapshot step cannot happen and would be a bug.
 */
function buildStepDetails(session: ActiveSession): SessionHistoryStepDetail[] {
  const steps = session.snapshot.steps;
  return Object.entries(session.statsStepLedger)
    .map(([key, ms]) => ({ index: Number(key), ms }))
    .filter(({ ms }) => ms > 0)
    .sort((a, b) => a.index - b.index)
    .map(({ index, ms }) => {
      const step = steps[index];
      if (!step) {
        throw new PersistenceError(
          `统计明细索引越界：步骤 ${index} 不在会话快照中（session ${session.sessionId}）`,
        );
      }
      return {
        stepIndex: index,
        stepId: step.id,
        stepName: step.displayName,
        trainingTypeId: session.trainingTypeId,
        effectiveMs: ms,
      };
    });
}

export function createSessionHistoryRepository(db: SqlDatabase): SessionHistoryRepository {
  /** Clear the singleton row, but only while it still holds this session. */
  async function clearActiveRow(sessionId: string): Promise<void> {
    await db.run('DELETE FROM active_session WHERE id = 1 AND session_id = ?', [sessionId]);
  }

  /** Persist an anomaly notice. Throws on failure on purpose: a caller that
   * is about to discard a session must not clear the row when the loss went
   * unrecorded (V1.3 §3: 通知持久化失败不得静默清活动行). */
  async function insertAnomalyNotice(
    reasonCode: StatsAnomalyReasonCode,
    options: { sessionId?: string | null; wallMs?: number } = {},
  ): Promise<void> {
    const wallMs = options.wallMs ?? Date.now();
    await db.run(
      `INSERT INTO stats_anomaly_notice (reason_code, occurred_at_wall_ms, session_id, dismissed_at_wall_ms)
       VALUES (?, ?, ?, NULL)`,
      [reasonCode, wallMs, options.sessionId ?? null],
    );
  }

  return {
    async archiveAndClear(session, input): Promise<ArchiveOutcome> {
      const classification = classifyTerminalSession(session);

      if (classification.kind === 'not-terminal') {
        return { kind: 'not-terminal' };
      }

      if (classification.kind === 'excluded') {
        // Expected exclusion: clear the dead row (a terminal row can never be
        // resumed) but record nothing — the caller explains neutrally.
        await clearActiveRow(session.sessionId);
        return { kind: 'excluded', reason: classification.reason };
      }

      // Wall clock moved backwards during the session (R006 proved clock
      // changes keep the session alive, so this is reachable): the local end
      // date would be a pure guess. V1.3 §3「日期不可信不猜」-> not archived,
      // and because this is outside the closed expected-exclusion enum it is
      // an anomalous loss: persist the notice BEFORE clearing. A failed
      // notice write throws and keeps the row for a retry (dedup by
      // session_id so the retry does not stack duplicates).
      if (input.endWallMs < session.snapshot.capturedAtWallMs) {
        const noticed = await db.get<{ id: number }>(
          `SELECT id FROM stats_anomaly_notice
            WHERE reason_code = 'wall-date-untrusted' AND session_id = ?
              AND dismissed_at_wall_ms IS NULL`,
          [session.sessionId],
        );
        if (!noticed) {
          await insertAnomalyNotice('wall-date-untrusted', {
            sessionId: session.sessionId,
            wallMs: input.endWallMs,
          });
        }
        await clearActiveRow(session.sessionId);
        return { kind: 'wall-date-untrusted' };
      }

      const endWallMs = input.endWallMs;
      const endUtcOffsetMin = input.endTimezoneOffsetMin ?? deviceTimezoneOffsetMin(endWallMs);
      const record: SessionHistoryRecord = {
        sessionId: session.sessionId,
        routineId: session.routineId,
        routineName: session.routineName,
        trainingTypeId: session.trainingTypeId,
        startedAtWallMs: session.snapshot.capturedAtWallMs,
        endedAtWallMs: endWallMs,
        endLocalDate: localDateFromWallMs(endWallMs, endUtcOffsetMin),
        endUtcOffsetMin,
        totalStepMs: session.statsTotalStepMs,
        endState: classification.endState,
        endedEarly: classification.endedEarly,
      };
      const details = buildStepDetails(session);

      try {
        await db.transaction(async () => {
          // Idempotency: the primary key decides. A retried archive finds the
          // row and only (re-)clears the active session.
          const existing = await db.get<{ session_id: string }>(
            'SELECT session_id FROM session_history WHERE session_id = ?',
            [session.sessionId],
          );
          if (!existing) {
            await db.run(
              `INSERT INTO session_history (${HISTORY_COLUMNS})
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                record.sessionId,
                record.routineId,
                record.routineName,
                record.trainingTypeId,
                record.startedAtWallMs,
                record.endedAtWallMs,
                record.endLocalDate,
                record.endUtcOffsetMin,
                record.totalStepMs,
                record.endState,
                record.endedEarly ? 1 : 0,
                endWallMs,
              ] satisfies SqlParams,
            );
            for (const detail of details) {
              await db.run(
                `INSERT INTO session_history_steps
                   (session_id, step_index, step_id, step_name, training_type_id, effective_ms)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  record.sessionId,
                  detail.stepIndex,
                  detail.stepId,
                  detail.stepName,
                  detail.trainingTypeId,
                  detail.effectiveMs,
                ],
              );
            }
          }
          // Same transaction: either both the archive and the clear commit, or
          // neither does and the session stays resumable for a retry.
          await clearActiveRow(session.sessionId);
        });
      } catch (error) {
        throw new PersistenceError('归档训练记录失败', error);
      }

      return { kind: 'archived', record };
    },

    async listTrainingTypes(): Promise<TrainingTypeInfo[]> {
      const rows = await db.all<{
        type_id: string;
        name_zh: string;
        name_en: string;
        sort_order: number;
        is_builtin: number;
        is_active: number;
      }>(
        'SELECT * FROM training_types ORDER BY sort_order ASC, type_id ASC',
      );
      return rows.map((row) => ({
        typeId: row.type_id,
        nameZh: row.name_zh,
        nameEn: row.name_en,
        sortOrder: row.sort_order,
        isBuiltin: row.is_builtin === 1,
        isActive: row.is_active === 1,
      }));
    },

    async getTotals(): Promise<SessionTotals> {
      const row = await db.get<{ total_step_ms: number | null; session_count: number }>(
        'SELECT SUM(total_step_ms) AS total_step_ms, COUNT(*) AS session_count FROM session_history',
      );
      return {
        totalStepMs: row?.total_step_ms ?? 0,
        sessionCount: row?.session_count ?? 0,
      };
    },

    async getTotalsByType(): Promise<SessionTypeTotals[]> {
      // GROUP BY, not a code enum: a type inserted later is picked up here
      // without any code change (extensibility DoD).
      return db.all<SessionTypeTotals>(
        `SELECT training_type_id AS trainingTypeId,
                SUM(total_step_ms) AS totalStepMs,
                COUNT(*) AS sessionCount
           FROM session_history
          GROUP BY training_type_id`,
      );
    },

    async getRecent(limit): Promise<SessionHistoryRecord[]> {
      const rows = await db.all<SessionHistoryRow>(
        `SELECT ${HISTORY_COLUMNS}
           FROM session_history
          ORDER BY ended_at_wall_ms DESC, session_id DESC
          LIMIT ?`,
        [Math.max(0, Math.trunc(limit))],
      );
      return rows.map(toRecord);
    },

    async getStepDetails(sessionId): Promise<SessionHistoryStepDetail[]> {
      return db.all<SessionHistoryStepDetail>(
        `SELECT step_index AS stepIndex, step_id AS stepId, step_name AS stepName,
                training_type_id AS trainingTypeId, effective_ms AS effectiveMs
           FROM session_history_steps
          WHERE session_id = ?
          ORDER BY step_index ASC`,
        [sessionId],
      );
    },

    async deleteRecord(sessionId): Promise<boolean> {
      let deleted = false;
      await db.transaction(async () => {
        const existing = await db.get<{ session_id: string }>(
          'SELECT session_id FROM session_history WHERE session_id = ?',
          [sessionId],
        );
        if (!existing) {
          return;
        }
        await db.run('DELETE FROM session_history_steps WHERE session_id = ?', [sessionId]);
        await db.run('DELETE FROM session_history WHERE session_id = ?', [sessionId]);
        deleted = true;
      });
      return deleted;
    },

    async clearAllStats(): Promise<void> {
      await db.transaction(async () => {
        await db.run('DELETE FROM session_history_steps');
        await db.run('DELETE FROM session_history');
        await db.run('DELETE FROM stats_anomaly_notice');
      });
    },

    async recordAnomaly(reasonCode, options = {}): Promise<void> {
      await insertAnomalyNotice(reasonCode, options);
    },

    async listActiveAnomalies(): Promise<StatsAnomalyNotice[]> {
      const rows = await db.all<{
        id: number;
        reason_code: string;
        occurred_at_wall_ms: number;
        session_id: string | null;
        dismissed_at_wall_ms: number | null;
      }>(
        `SELECT id, reason_code, occurred_at_wall_ms, session_id, dismissed_at_wall_ms
           FROM stats_anomaly_notice
          WHERE dismissed_at_wall_ms IS NULL
          ORDER BY occurred_at_wall_ms DESC, id DESC`,
      );
      return rows.map((row) => ({
        id: row.id,
        reasonCode: row.reason_code as StatsAnomalyReasonCode,
        occurredAtWallMs: row.occurred_at_wall_ms,
        sessionId: row.session_id,
        dismissedAtWallMs: row.dismissed_at_wall_ms,
      }));
    },

    async dismissAllAnomalies(wallMs): Promise<void> {
      await db.run(
        'UPDATE stats_anomaly_notice SET dismissed_at_wall_ms = ? WHERE dismissed_at_wall_ms IS NULL',
        [wallMs],
      );
    },
  };
}
