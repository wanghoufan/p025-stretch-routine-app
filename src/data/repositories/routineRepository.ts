import type { Routine, RoutineSummary } from '../../domain/routine/Routine';
import type { RoutineStep, StepSide } from '../../domain/routine/RoutineStep';
import {
  clampDuration,
  clampTransition,
  ROUTINE_NAME_MAX_LENGTH,
  STEP_NAME_MAX_LENGTH,
  SPEAK_TEXT_MAX_LENGTH,
} from '../../domain/routine/constants';
import { totalDurationSec } from '../../domain/routine/duration';
import { joinTagList, normalizeDifficulty, type TagFields } from '../../domain/tags';
import type { SqlDatabase } from '../db/Database';
import {
  rowToRoutine,
  rowToRoutineStep,
  type RoutineRow,
  type RoutineStepRow,
} from '../mappers/routineMapper';
import type { WallClock } from '../../services/clock';
import { generateId, type IdGenerator } from '../../shared/utils/id';
import { PersistenceError, ValidationError } from '../../shared/errors';

/** Step values accepted when saving a routine; ids are optional for new steps. */
export interface RoutineStepInput {
  id?: string;
  sourceActionId?: string;
  displayName: string;
  speakText?: string;
  durationSec: number;
  transitionSec: number;
  pairGroupId?: string;
  side?: StepSide;
}

export interface RoutineInput extends TagFields {
  name: string;
  defaultDurationSec: number;
  defaultTransitionSec: number;
  /**
   * Training type (TASK-021-B3/HD-1): a `training_types.type_id`, or
   * `null` for 未分类. On `create` an omitted value stores NULL; on `update`
   * an omitted value keeps the existing one, while an explicit `null`
   * re-classifies the routine as 未分类.
   */
  trainingTypeId?: string | null;
  /** Ordered steps. At least one valid step is required (FR-003). */
  steps: readonly RoutineStepInput[];
}

export interface RoutineWithSteps {
  routine: Routine;
  steps: RoutineStep[];
}

export interface RoutineRepository {
  list(): Promise<Routine[]>;
  listSummaries(): Promise<RoutineSummary[]>;
  getById(id: string): Promise<Routine | null>;
  getWithSteps(id: string): Promise<RoutineWithSteps | null>;
  create(input: RoutineInput): Promise<RoutineWithSteps>;
  update(id: string, input: RoutineInput): Promise<RoutineWithSteps>;
  remove(id: string): Promise<void>;
}

export interface RoutineRepositoryDeps {
  db: SqlDatabase;
  /** Real-world timestamps only (`createdAt` / `updatedAt`), never runner timing. */
  clock: WallClock;
  generateId?: IdGenerator;
}

function normalizeRoutineName(name: string): string {
  const trimmed = name.trim().slice(0, ROUTINE_NAME_MAX_LENGTH);
  if (trimmed.length === 0) {
    throw new ValidationError('流程名称不能为空');
  }
  return trimmed;
}

/** Steps are validated together so a save is all-or-nothing (FR-003). */
export function normalizeStepInputs(inputs: readonly RoutineStepInput[]): RoutineStepInput[] {
  const normalized = inputs.map((input) => {
    const displayName = input.displayName.trim().slice(0, STEP_NAME_MAX_LENGTH);
    if (displayName.length === 0) {
      throw new ValidationError('步骤名称不能为空');
    }
    return {
      ...input,
      displayName,
      speakText: (input.speakText?.trim() || displayName).slice(0, SPEAK_TEXT_MAX_LENGTH),
      durationSec: clampDuration(input.durationSec),
      transitionSec: clampTransition(input.transitionSec),
      side: input.side ?? ('none' as StepSide),
    };
  });

  if (normalized.length === 0) {
    throw new ValidationError('流程至少需要一个步骤');
  }

  return normalized;
}

export function createRoutineRepository(deps: RoutineRepositoryDeps): RoutineRepository {
  const { db, clock } = deps;
  const nextId = deps.generateId ?? generateId;

  async function loadSteps(routineId: string): Promise<RoutineStep[]> {
    const rows = await db.all<RoutineStepRow>(
      'SELECT * FROM routine_steps WHERE routine_id = ? ORDER BY order_index ASC',
      [routineId],
    );
    return rows.map(rowToRoutineStep);
  }

  async function insertSteps(routineId: string, inputs: readonly RoutineStepInput[]): Promise<RoutineStep[]> {
    const steps: RoutineStep[] = inputs.map((input, index) => ({
      id: input.id ?? nextId('step'),
      routineId,
      sourceActionId: input.sourceActionId,
      orderIndex: index,
      displayName: input.displayName.trim().slice(0, STEP_NAME_MAX_LENGTH),
      speakText: (input.speakText?.trim() || input.displayName.trim()).slice(0, SPEAK_TEXT_MAX_LENGTH),
      durationSec: clampDuration(input.durationSec),
      transitionSec: clampTransition(input.transitionSec),
      pairGroupId: input.pairGroupId,
      side: input.side ?? 'none',
    }));

    for (const step of steps) {
      await db.run(
        `INSERT INTO routine_steps
           (id, routine_id, source_action_id, order_index, display_name, speak_text,
            duration_sec, transition_sec, pair_group_id, side)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          step.id,
          step.routineId,
          step.sourceActionId ?? null,
          step.orderIndex,
          step.displayName,
          step.speakText,
          step.durationSec,
          step.transitionSec,
          step.pairGroupId ?? null,
          step.side,
        ],
      );
    }

    return steps;
  }

  async function getById(id: string): Promise<Routine | null> {
    const row = await db.get<RoutineRow>('SELECT * FROM routines WHERE id = ?', [id]);
    return row ? rowToRoutine(row) : null;
  }

  async function list(): Promise<Routine[]> {
    const rows = await db.all<RoutineRow>('SELECT * FROM routines ORDER BY updated_at DESC');
    return rows.map(rowToRoutine);
  }

  async function getWithSteps(id: string): Promise<RoutineWithSteps | null> {
    const routine = await getById(id);
    if (!routine) {
      return null;
    }
    return { routine, steps: await loadSteps(id) };
  }

  return {
    list,

    async listSummaries(): Promise<RoutineSummary[]> {
      const routines = await list();
      const summaries: RoutineSummary[] = [];
      for (const routine of routines) {
        const steps = await loadSteps(routine.id);
        summaries.push({
          ...routine,
          stepCount: steps.length,
          totalDurationSec: totalDurationSec(steps),
        });
      }
      return summaries;
    },

    getById,

    getWithSteps,

    async create(input: RoutineInput): Promise<RoutineWithSteps> {
      const name = normalizeRoutineName(input.name);
      const steps = normalizeStepInputs(input.steps);
      const now = new Date(clock.nowMs()).toISOString();
      const routine: Routine = {
        id: nextId('rtn'),
        name,
        defaultDurationSec: clampDuration(input.defaultDurationSec),
        defaultTransitionSec: clampTransition(input.defaultTransitionSec),
        category: input.category,
        difficulty: normalizeDifficulty(input.difficulty),
        bodypart: input.bodypart,
        trainingTypeId: input.trainingTypeId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await db.transaction(async () => {
          await db.run(
            `INSERT INTO routines
               (id, name, default_duration_sec, default_transition_sec, category, difficulty, bodypart, training_type_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              routine.id,
              routine.name,
              routine.defaultDurationSec,
              routine.defaultTransitionSec,
              joinTagList(routine.category),
              routine.difficulty ?? null,
              joinTagList(routine.bodypart),
              input.trainingTypeId ?? null,
              routine.createdAt,
              routine.updatedAt,
            ],
          );
          await insertSteps(routine.id, steps);
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new PersistenceError('保存流程失败', error);
      }

      return { routine, steps: await loadSteps(routine.id) };
    },

    /**
     * Full replace of the step list. The steps are the *snapshot* values, so no
     * reusable Action is read or written here (Constitution XI).
     */
    async update(id: string, input: RoutineInput): Promise<RoutineWithSteps> {
      const existing = await getById(id);
      if (!existing) {
        throw new ValidationError('流程不存在');
      }
      const name = normalizeRoutineName(input.name);
      const steps = normalizeStepInputs(input.steps);
      const updatedAt = new Date(clock.nowMs()).toISOString();

      try {
        await db.transaction(async () => {
          await db.run(
            `UPDATE routines
                SET name = ?, default_duration_sec = ?, default_transition_sec = ?,
                    category = ?, difficulty = ?, bodypart = ?, training_type_id = ?, updated_at = ?
              WHERE id = ?`,
            [
              name,
              clampDuration(input.defaultDurationSec),
              clampTransition(input.defaultTransitionSec),
              joinTagList(input.category ?? existing.category),
              normalizeDifficulty(input.difficulty ?? existing.difficulty) ?? null,
              joinTagList(input.bodypart ?? existing.bodypart),
              // `null` is meaningful (未分类), so only an *omitted* field keeps
              // the stored value — same contract as the tag fields above.
              'trainingTypeId' in input ? (input.trainingTypeId ?? null) : (existing.trainingTypeId ?? null),
              updatedAt,
              id,
            ],
          );
          await db.run('DELETE FROM routine_steps WHERE routine_id = ?', [id]);
          await insertSteps(id, steps);
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new PersistenceError('更新流程失败', error);
      }

      const saved = await getWithSteps(id);
      if (!saved) {
        throw new PersistenceError('更新流程后无法读回数据');
      }
      return saved;
    },

    async remove(id: string): Promise<void> {
      await db.transaction(async () => {
        await db.run('DELETE FROM routine_steps WHERE routine_id = ?', [id]);
        await db.run('DELETE FROM routines WHERE id = ?', [id]);
      });
    },
  };
}
