/**
 * Routine grouping for Home (TASK-021-F2, V1.3 HD-1/HD-3).
 *
 * Home groups are driven by the routine's **training type** — the same
 * `training_type_id` that the statistics page counts by — so the two views can
 * never drift apart. The previous rule guessed a scene from the routine's
 * `category` tags and printed names like「健身前后」that never existed in the
 * data and did not describe their contents; that whole mapping is gone.
 *
 * Group names come from the `training_types` table, never from a hardcoded
 * list, so adding a row (e.g. 上肢训练) makes a new Home group appear without a
 * code change. Routines whose `training_type_id` is NULL fall into the
 * unclassified bucket, labelled from the i18n dictionary.
 */

import type { RoutineSummary } from '../../../domain/routine/Routine';

export const UNCLASSIFIED_SCENE = 'unclassified';

export interface RoutineSceneGroup {
  /** `training_types.type_id`, or {@link UNCLASSIFIED_SCENE} for the fallback. */
  scene: string;
  /** Resolved display name: the table's localized name, or the i18n fallback. */
  name: string;
  /** Stable testID / key, e.g. `routine-group-CORE`. */
  key: string;
  count: number;
  routines: RoutineSummary[];
}

/** Localized name for one training type, keyed by `type_id`. */
export type TrainingTypeNames = Readonly<Record<string, string>>;

/**
 * Group routines by training type, in the order the table declares them.
 * Empty groups are dropped; anything unrecognised lands in the unclassified
 * bucket so nothing silently disappears from Home. `unclassifiedName` is the
 * already-localized fallback label, resolved by the caller from i18n.
 */
export function groupRoutines(
  routines: readonly RoutineSummary[],
  typeNames: TrainingTypeNames,
  unclassifiedName: string = '未分类',
): RoutineSceneGroup[] {
  const unclassified: RoutineSummary[] = [];
  const buckets = new Map<string, RoutineSummary[]>();

  for (const routine of routines) {
    const typeId = routine.trainingTypeId;
    if (typeId && typeNames[typeId]) {
      const bucket = buckets.get(typeId);
      if (bucket) {
        bucket.push(routine);
      } else {
        buckets.set(typeId, [routine]);
      }
      continue;
    }
    unclassified.push(routine);
  }

  const groups: RoutineSceneGroup[] = [];
  // `typeNames` preserves the table's declared order (sort + id), so the Home
  // section order follows the type table rather than an alphabet.
  for (const [typeId, name] of Object.entries(typeNames)) {
    const bucket = buckets.get(typeId);
    if (!bucket || bucket.length === 0) {
      continue;
    }
    groups.push({ scene: typeId, name, key: `routine-group-${typeId}`, count: bucket.length, routines: bucket });
  }

  if (unclassified.length > 0) {
    groups.push({
      scene: UNCLASSIFIED_SCENE,
      name: unclassifiedName,
      key: `routine-group-${UNCLASSIFIED_SCENE}`,
      count: unclassified.length,
      routines: unclassified,
    });
  }

  return groups;
}
