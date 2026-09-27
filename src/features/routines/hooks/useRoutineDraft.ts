import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '../../../domain/action/Action';
import type { RoutineStepDraft } from '../../../domain/routine/RoutineStep';
import type { RoutineWithSteps } from '../../../data/repositories/routineRepository';
import {
  clampDuration,
  clampTransition,
  STEP_NAME_MAX_LENGTH,
} from '../../../domain/routine/constants';
import { findPairMate, updatePairValues, updateSingleSide } from '../../../domain/routine/bilateral';
import { parseBatchActionsDetailed, buildDraftsFromBatch } from '../services/parseBatchActions';
import { draftsFromActions } from '../services/addActionToRoutine';
import { saveRoutine } from '../services/saveRoutine';
import { ValidationError } from '../../../shared/errors';
import type { AppServices } from '../../../app/providers/createAppServices';

/**
 * Editor draft state (T027, T064, T086).
 *
 * The draft is the single source of truth for both "new routine" and "edit
 * routine": loading an existing routine simply fills the same structure, so the
 * reorder/edit/delete behaviour is identical in both modes.
 */

export interface RoutineDraft {
  routineId?: string;
  name: string;
  defaultDurationSec: number;
  defaultTransitionSec: number;
  category: string[];
  /**
   * Training type (TASK-021-B3): a `training_types.type_id` or `null` for
   * 未分类. New routines start unclassified; edits echo the stored value and
   * are always saved explicitly (explicit `null` = re-classify as 未分类).
   */
  trainingTypeId: string | null;
  steps: RoutineStepDraft[];
}

export interface DraftDefaults {
  defaultDurationSec: number;
  defaultTransitionSec: number;
}

export type StepEditScope = 'single' | 'pair';

export interface UseRoutineDraftResult {
  draft: RoutineDraft | null;
  loading: boolean;
  error: string | null;
  setName: (name: string) => void;
  setCategory: (category: string[]) => void;
  setTrainingTypeId: (typeId: string | null) => void;
  setDefaultDurationSec: (seconds: number) => void;
  setDefaultTransitionSec: (seconds: number) => void;
  /** Parses pasted lines and appends them as ordered steps. Returns added count. */
  addBatch: (input: string) => number;
  /** Appends steps snapshotted from library Actions. Returns added count. */
  addActions: (actions: readonly Action[]) => number;
  updateStep: (
    stepId: string,
    values: Partial<Pick<RoutineStepDraft, 'displayName' | 'speakText' | 'durationSec' | 'transitionSec'>>,
    scope?: StepEditScope,
  ) => void;
  removeStep: (stepId: string) => void;
  duplicateStep: (stepId: string) => void;
  moveStep: (stepId: string, direction: -1 | 1) => void;
  isFirst: (stepId: string) => boolean;
  isLast: (stepId: string) => boolean;
  pairMateId: (stepId: string) => string | undefined;
  save: () => Promise<RoutineWithSteps>;
}

function createEmptyDraft(defaults: DraftDefaults): RoutineDraft {
  return {
    name: '',
    defaultDurationSec: clampDuration(defaults.defaultDurationSec),
    defaultTransitionSec: clampTransition(defaults.defaultTransitionSec),
    category: [],
    // V1.3 HD-1: a brand-new routine starts unclassified.
    trainingTypeId: null,
    steps: [],
  };
}

function toDraft(routineId: string, loaded: RoutineWithSteps): RoutineDraft {
  return {
    routineId,
    name: loaded.routine.name,
    defaultDurationSec: loaded.routine.defaultDurationSec,
    defaultTransitionSec: loaded.routine.defaultTransitionSec,
    category: [...(loaded.routine.category ?? [])],
    trainingTypeId: loaded.routine.trainingTypeId ?? null,
    steps: loaded.steps.map((step) => ({
      id: step.id,
      sourceActionId: step.sourceActionId,
      displayName: step.displayName,
      speakText: step.speakText,
      durationSec: step.durationSec,
      transitionSec: step.transitionSec,
      pairGroupId: step.pairGroupId,
      side: step.side,
    })),
  };
}

export function useRoutineDraft(options: {
  services: AppServices;
  routineId?: string;
  defaults: DraftDefaults;
}): UseRoutineDraftResult {
  const { services, routineId, defaults } = options;
  const [draft, setDraft] = useState<RoutineDraft | null>(null);
  const [loading, setLoading] = useState(Boolean(routineId));
  const [error, setError] = useState<string | null>(null);

  // `defaults` changes identity on every settings render; keep the latest in a
  // ref so draft initialisation still happens exactly once.
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(() => {
    let cancelled = false;

    if (!routineId) {
      setDraft(createEmptyDraft(defaultsRef.current));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    services.routines
      .getWithSteps(routineId)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        if (!loaded) {
          setError('流程不存在');
          setDraft(null);
          return;
        }
        setDraft(toDraft(routineId, loaded));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '读取流程失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [services, routineId]);

  const mutateSteps = useCallback((mutator: (steps: RoutineStepDraft[]) => RoutineStepDraft[]) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }
      return { ...previous, steps: mutator([...previous.steps]) };
    });
  }, []);

  const setName = useCallback((name: string) => {
    setDraft((previous) => (previous ? { ...previous, name } : previous));
  }, []);

  const setCategory = useCallback((category: string[]) => {
    setDraft((previous) => (previous ? { ...previous, category } : previous));
  }, []);

  const setTrainingTypeId = useCallback((trainingTypeId: string | null) => {
    setDraft((previous) => (previous ? { ...previous, trainingTypeId } : previous));
  }, []);

  const setDefaultDurationSec = useCallback((seconds: number) => {
    setDraft((previous) =>
      previous ? { ...previous, defaultDurationSec: clampDuration(seconds) } : previous,
    );
  }, []);

  const setDefaultTransitionSec = useCallback((seconds: number) => {
    setDraft((previous) =>
      previous ? { ...previous, defaultTransitionSec: clampTransition(seconds) } : previous,
    );
  }, []);

  const addBatch = useCallback(
    (input: string) => {
      const parsed = parseBatchActionsDetailed(input);
      if (parsed.names.length === 0) {
        return 0;
      }
      mutateSteps((steps) => {
        const created = buildDraftsFromBatch(parsed.names, {
          defaultDurationSec: clampDuration(defaultsRef.current.defaultDurationSec),
          defaultTransitionSec: clampTransition(defaultsRef.current.defaultTransitionSec),
          generateId: services.generateId,
        });
        return [...steps, ...created];
      });
      return parsed.names.length;
    },
    [mutateSteps, services],
  );

  const addActions = useCallback(
    (actions: readonly Action[]) => {
      if (actions.length === 0) {
        return 0;
      }
      const created = draftsFromActions(actions, {
        transitionSec: clampTransition(defaultsRef.current.defaultTransitionSec),
        fallbackDurationSec: clampDuration(defaultsRef.current.defaultDurationSec),
        generateId: services.generateId,
      });
      mutateSteps((steps) => [...steps, ...created]);
      return created.length;
    },
    [mutateSteps, services],
  );

  const updateStep = useCallback<UseRoutineDraftResult['updateStep']>(
    (stepId, values, scope = 'single') => {
      mutateSteps((steps) => {
        const target = steps.find((step) => step.id === stepId);
        if (!target) {
          return steps;
        }
        if (scope === 'pair' && target.pairGroupId) {
          // "两端一起改": only paired-safe values are pushed to both sides.
          const pairValues: { durationSec?: number; transitionSec?: number } = {};
          if (values.durationSec !== undefined) {
            pairValues.durationSec = clampDuration(values.durationSec);
          }
          if (values.transitionSec !== undefined) {
            pairValues.transitionSec = clampTransition(values.transitionSec);
          }
          return updatePairValues(steps, target.pairGroupId, pairValues);
        }
        return updateSingleSide(steps, stepId, values);
      });
    },
    [mutateSteps],
  );

  const removeStep = useCallback(
    (stepId: string) => {
      mutateSteps((steps) => steps.filter((step) => step.id !== stepId));
    },
    [mutateSteps],
  );

  const duplicateStep = useCallback(
    (stepId: string) => {
      mutateSteps((steps) => {
        const index = steps.findIndex((step) => step.id === stepId);
        if (index < 0) {
          return steps;
        }
        const source = steps[index];
        if (!source) {
          return steps;
        }
        const copy: RoutineStepDraft = {
          ...source,
          id: services.generateId('step'),
          displayName: source.displayName.slice(0, STEP_NAME_MAX_LENGTH),
          // A duplicated side is a standalone step, not part of the old pair.
          pairGroupId: undefined,
        };
        const next = [...steps];
        next.splice(index + 1, 0, copy);
        return next;
      });
    },
    [mutateSteps, services],
  );

  const moveStep = useCallback(
    (stepId: string, direction: -1 | 1) => {
      mutateSteps((steps) => {
        const index = steps.findIndex((step) => step.id === stepId);
        const targetIndex = index + direction;
        if (index < 0 || targetIndex < 0 || targetIndex >= steps.length) {
          return steps;
        }
        const next = [...steps];
        const a = next[index];
        const b = next[targetIndex];
        if (!a || !b) {
          return steps;
        }
        next[index] = b;
        next[targetIndex] = a;
        return next;
      });
    },
    [mutateSteps],
  );

  const steps = useMemo(() => draft?.steps ?? [], [draft]);

  const isFirst = useCallback(
    (stepId: string) => steps.findIndex((step) => step.id === stepId) === 0,
    [steps],
  );

  const isLast = useCallback(
    (stepId: string) => steps.findIndex((step) => step.id === stepId) === steps.length - 1,
    [steps],
  );

  const pairMateId = useCallback(
    (stepId: string) => {
      const target = steps.find((step) => step.id === stepId);
      if (!target) {
        return undefined;
      }
      return findPairMate(steps, target)?.id;
    },
    [steps],
  );

  const save = useCallback(async () => {
    if (!draft) {
      throw new ValidationError('尚未准备好流程草稿');
    }
    const saved = await saveRoutine(services.routines, {
      ...(draft.routineId ? { routineId: draft.routineId } : {}),
      name: draft.name,
      defaultDurationSec: draft.defaultDurationSec,
      defaultTransitionSec: draft.defaultTransitionSec,
      category: draft.category,
      // Always explicit from the editor: a selected 未分类 saves a real
      // `null` (re-classify), never an omission.
      trainingTypeId: draft.trainingTypeId,
      steps: draft.steps,
    });
    setDraft(toDraft(saved.routine.id, saved));
    return saved;
  }, [draft, services]);

  return {
    draft,
    loading,
    error,
    setName,
    setCategory,
    setTrainingTypeId,
    setDefaultDurationSec,
    setDefaultTransitionSec,
    addBatch,
    addActions,
    updateStep,
    removeStep,
    duplicateStep,
    moveStep,
    isFirst,
    isLast,
    pairMateId,
    save,
  };
}
