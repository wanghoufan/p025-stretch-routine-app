import type { Routine } from '../../domain/routine/Routine';
import type { RoutineStep, StepSide } from '../../domain/routine/RoutineStep';
import { normalizeDifficulty, splitTagList, type TagFields } from '../../domain/tags';

/** Row shape of the `routines` table. */
export interface RoutineRow {
  id: string;
  name: string;
  default_duration_sec: number;
  default_transition_sec: number;
  created_at: string;
  updated_at: string;
  category: string | null;
  difficulty: string | null;
  bodypart: string | null;
  training_type_id: string | null;
}

/** Row shape of the `routine_steps` table. */
export interface RoutineStepRow {
  id: string;
  routine_id: string;
  source_action_id: string | null;
  order_index: number;
  display_name: string;
  speak_text: string;
  duration_sec: number;
  transition_sec: number;
  pair_group_id: string | null;
  side: string;
}

function toStepSide(value: string): StepSide {
  if (value === 'left' || value === 'right') {
    return value;
  }
  return 'none';
}

export function rowToRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    defaultDurationSec: row.default_duration_sec,
    defaultTransitionSec: row.default_transition_sec,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...rowToRoutineTags(row),
    trainingTypeId: row.training_type_id,
  };
}

/** Tag fields decoded from the comma-separated columns. */
export function rowToRoutineTags(row: Pick<RoutineRow, 'category' | 'difficulty' | 'bodypart'>): TagFields {
  return {
    category: splitTagList(row.category),
    difficulty: normalizeDifficulty(row.difficulty),
    bodypart: splitTagList(row.bodypart),
  };
}

export function rowToRoutineStep(row: RoutineStepRow): RoutineStep {
  return {
    id: row.id,
    routineId: row.routine_id,
    sourceActionId: row.source_action_id ?? undefined,
    orderIndex: row.order_index,
    displayName: row.display_name,
    speakText: row.speak_text,
    durationSec: row.duration_sec,
    transitionSec: row.transition_sec,
    pairGroupId: row.pair_group_id ?? undefined,
    side: toStepSide(row.side),
  };
}

/** Steps arrive from SQL ordered; this keeps the domain contract explicit. */
export function sortSteps(steps: readonly RoutineStep[]): RoutineStep[] {
  return [...steps].sort((a, b) => a.orderIndex - b.orderIndex);
}

/** Re-assign contiguous order indexes after reorder/insert/delete. */
export function normalizeOrder(steps: readonly RoutineStep[]): RoutineStep[] {
  return steps.map((step, index) => ({ ...step, orderIndex: index }));
}
