import type { RoutineStepDraft } from '../../../domain/routine/RoutineStep';
import type {
  RoutineRepository,
  RoutineStepInput,
  RoutineWithSteps,
} from '../../../data/repositories/routineRepository';
import { ValidationError } from '../../../shared/errors';

/**
 * Validates and persists an editor draft (T032, T065, FR-002/FR-003).
 *
 * Created and edited routines go through the same path so an edit can never
 * bypass the "at least one valid step" rule.
 */
export interface SaveRoutineDraft {
  /** Present when editing an existing routine. */
  routineId?: string;
  name: string;
  defaultDurationSec: number;
  defaultTransitionSec: number;
  /** Home group tag(s); empty means the 「其他」 fallback. */
  category: string[];
  /**
   * Training type (TASK-021-B3): a `training_types.type_id`, `null` for
   * 未分类. The editor always passes it explicitly (an explicit `null`
   * re-classifies an existing routine); omitting the field keeps the stored
   * value on `update` — the repository contract, unchanged (B1).
   */
  trainingTypeId?: string | null;
  steps: readonly RoutineStepDraft[];
}

/** Throws {@link ValidationError} with a user-facing Chinese message. */
export function validateRoutineDraft(draft: SaveRoutineDraft): void {
  if (draft.name.trim().length === 0) {
    throw new ValidationError('请填写流程名称');
  }
  if (draft.steps.length === 0) {
    throw new ValidationError('请至少添加一个动作');
  }
  draft.steps.forEach((step, index) => {
    if (step.displayName.trim().length === 0) {
      throw new ValidationError(`第 ${index + 1} 个动作名称为空，请补全后再保存`);
    }
  });
}

/**
 * Draft -> repository input. Snapshot values are copied verbatim; no reusable
 * Action is re-read here, which is what keeps old routines stable (FR-015).
 */
export function toStepInputs(steps: readonly RoutineStepDraft[]): RoutineStepInput[] {
  return steps.map((step) => ({
    id: step.id,
    sourceActionId: step.sourceActionId,
    displayName: step.displayName,
    speakText: step.speakText,
    durationSec: step.durationSec,
    transitionSec: step.transitionSec,
    pairGroupId: step.pairGroupId,
    side: step.side,
  }));
}

export async function saveRoutine(
  repository: RoutineRepository,
  draft: SaveRoutineDraft,
): Promise<RoutineWithSteps> {
  validateRoutineDraft(draft);

  const input = {
    name: draft.name,
    defaultDurationSec: draft.defaultDurationSec,
    defaultTransitionSec: draft.defaultTransitionSec,
    category: draft.category,
    // Omitted -> not sent, so an update keeps the stored type (repository
    // contract); an explicit value (including `null`) always overwrites.
    ...(draft.trainingTypeId === undefined ? {} : { trainingTypeId: draft.trainingTypeId }),
    steps: toStepInputs(draft.steps),
  };

  if (draft.routineId) {
    return repository.update(draft.routineId, input);
  }
  return repository.create(input);
}
