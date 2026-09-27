import type { ActionSideMode } from '../domain/action/Action';
import { createBilateralStepDrafts } from '../domain/routine/bilateral';
import type { StepSide } from '../domain/routine/RoutineStep';
import {
  clampDuration,
  clampTransition,
  DEFAULT_STEP_DURATION_SEC,
  DEFAULT_TRANSITION_SEC,
  ROUTINE_NAME_MAX_LENGTH,
  STEP_NAME_MAX_LENGTH,
  SPEAK_TEXT_MAX_LENGTH,
} from '../domain/routine/constants';
import { joinTagList } from '../domain/tags';
import { SystemWallClock, type WallClock } from '../services/clock';
import { generateId, type IdGenerator } from '../shared/utils/id';
import type { SqlDatabase } from './db/Database';

/**
 * First-launch seed library (TASK-005 / TASK-010, expanded by TASK-012 V2).
 *
 * Ships the approved V2 catalog: 28 stretch actions, 8 dynamic warm-ups and
 * an 11-action core library (59 actions in total), plus nine example routines (the five original ones
 * are kept for upgrade compatibility; 办公室肩颈放松 is renamed to
 * 办公室久坐放松 and lengthened). Seeding is strictly additive: it runs only
 * when `actions` and `routines` are both empty and never rewrites anything a
 * user owns.
 *
 * `SEED_VERSION` intentionally stays at 1: installs seeded by the original
 * catalog already recorded 1, and the repair pass is what tops them up with the
 * templates they are missing (TASK-010 R4, TASK-012).
 */

/** Stored in `app_settings`; bump when the shipped seed content changes. */
export const SEED_VERSION = 1;
export const SEED_VERSION_KEY = 'seed_version';

/**
 * Set once the user explicitly clears the shipped examples (TASK-010 R3).
 *
 * Without it the repair pass would resurrect everything on the next boot; with
 * it the examples stay gone until the app data itself is wiped.
 */
export const SEED_EXAMPLES_CLEARED_KEY = 'seed_examples_cleared';

export interface SeedActionDefinition {
  /** Stable reference used by `SEED_ROUTINES`; never shown to the user. */
  key: string;
  name: string;
  sideMode: ActionSideMode;
  /** 场景 tags (V2 §5). */
  category?: readonly string[];
  /** Single 低/中/高 level (V2 §5). */
  difficulty?: string;
  /** 部位 tags (V2 §5). */
  bodypart?: readonly string[];
  /** Spoken text; defaults to `name` so TTS says the Chinese name. */
  speakText?: string;
}

/** One step inside a shipped routine; overrides the Action defaults. */
export interface SeedRoutineStepDefinition {
  actionKey: string;
  /** Playback seconds; defaults to the 30s template step. */
  durationSec?: number;
  /** Rest after the step; defaults to the routine's `defaultTransitionSec`. */
  transitionSec?: number;
  /** Spoken text; defaults to the Action's speak text. */
  speakText?: string;
}

export interface SeedRoutineDefinition {
  name: string;
  /**
   * Training type frozen into the definition (TASK-021-B1, HD-5=B).
   *
   * Hand-assigned per shipped routine — never inferred from the name or the
   * category tags at runtime. Must reference a `training_types.type_id` seeded
   * by the V4 migration, so a wrong id fails loudly (FK) instead of guessing.
   */
  trainingTypeId: string;
  /** Ordered steps; bilateral Actions expand into a left/right pair. */
  steps: readonly SeedRoutineStepDefinition[];
  category?: readonly string[];
  difficulty?: string;
  bodypart?: readonly string[];
  /** Applied to every step unless the step overrides it. Core: 45/30/20. */
  defaultTransitionSec?: number;
}

const action = (
  key: string,
  name: string,
  sideMode: ActionSideMode,
  category: readonly string[],
  difficulty: string,
  bodypart: readonly string[],
): SeedActionDefinition => ({ key, name, sideMode, category, difficulty, bodypart });

export const SEED_ACTIONS: readonly SeedActionDefinition[] = [
  // ---- stretch: neck ----
  action('neck-side-bend', '颈部侧屈拉伸', 'bilateral', ['办公'], '中', ['颈', '肩']),
  action('upper-trap', '上斜方肌拉伸', 'bilateral', ['办公'], '中', ['颈', '肩']),
  action('levator-scapulae', '肩胛提肌拉伸', 'bilateral', ['办公'], '中', ['颈', '肩']),
  action('neck-rotation', '颈部旋转', 'bilateral', ['办公'], '低', ['颈']),
  action('upper-trap-press', '上斜方肌加压', 'bilateral', ['办公'], '中', ['颈', '肩']),
  // ---- stretch: shoulder ----
  action('cross-body-shoulder', '十字肩拉伸', 'bilateral', ['办公'], '中', ['肩']),
  action('shoulder-rolls', '肩部环绕', 'single', ['热身'], '低', ['肩']),
  action('towel-shoulder', '毛巾绕肩', 'single', ['办公'], '低', ['肩']),
  // ---- stretch: chest ----
  action('doorway-chest', '开门胸部拉伸', 'single', ['胸', '办公'], '中', ['胸', '肩']),
  action('wall-chest', '靠墙胸部拉伸', 'single', ['胸'], '中', ['胸', '肩']),
  action('wall-chest-3angle', '扶墙三角度胸拉伸', 'bilateral', ['胸', '办公'], '中', ['胸', '肩']),
  // ---- stretch: back ----
  action('side-bend', '体侧屈拉伸', 'bilateral', ['背'], '中', ['腰腹', '背']),
  action('supine-spinal-twist', '仰卧脊柱扭转', 'bilateral', ['睡前'], '中', ['背', '腰腹']),
  action('cat-cow', '猫牛式', 'single', ['晨起', '睡前'], '低', ['背']),
  action('child-pose', '儿童式', 'single', ['晨起', '睡前'], '低', ['背', '腰腹']),
  action('cobra', '眼镜蛇式', 'single', ['晨起'], '中', ['背', '腰腹']),
  action('thoracic-rotation', '坐姿胸椎旋转', 'bilateral', ['办公'], '中', ['背']),
  action('supine-knee-hug', '仰卧抱膝拉伸', 'single', ['睡前'], '低', ['腰腹', '背']),
  action('lat-side-bend', '阔背肌侧屈', 'bilateral', ['背'], '中', ['背', '腰腹']),
  action('camel', '骆驼式', 'single', ['晨起'], '高', ['背', '腰腹']),
  // ---- stretch: arm ----
  action('triceps', '肱三头肌拉伸', 'bilateral', ['办公'], '中', ['肩']),
  action('biceps-wall', '靠墙肱二头肌拉伸', 'bilateral', ['办公'], '中', ['肩']),
  action('forearm-wrist', '前臂拉伸', 'bilateral', ['办公'], '中', ['肩']),
  // ---- stretch: hip ----
  action('kneeling-hip-flexor', '跪姿髋屈肌拉伸', 'bilateral', ['跑后'], '中', ['髋臀', '腿']),
  action('butterfly', '蝴蝶式坐姿', 'single', ['睡前'], '中', ['髋臀']),
  action('glute-piriformis', '仰卧梨状肌拉伸', 'bilateral', ['睡前'], '中', ['髋臀']),
  action('figure-four', '坐姿四字臀部拉伸', 'bilateral', ['睡前'], '中', ['髋臀']),
  action('adductor-wide', '大腿内侧拉伸', 'single', ['跑后'], '中', ['腿', '髋臀']),
  action('pigeon', '鸽式', 'bilateral', ['跑后'], '中', ['髋臀', '腿']),
  action('ninety-ninety', '90/90转体', 'bilateral', ['办公'], '中', ['髋臀']),
  action('frog', '青蛙式', 'single', ['跑后'], '高', ['腿', '髋臀']),
  action('front-split', '纵劈叉渐进', 'single', ['跑后'], '高', ['腿', '髋臀']),
  // ---- stretch: leg ----
  action('standing-quad', '站姿股四头肌拉伸', 'bilateral', ['跑后'], '中', ['腿']),
  action('standing-hamstring', '站姿腿后肌拉伸', 'bilateral', ['跑后', '热身'], '中', ['腿']),
  action('seated-hamstring', '坐姿腿后肌拉伸', 'bilateral', ['跑后'], '中', ['腿']),
  action('standing-calf', '站姿小腿拉伸', 'bilateral', ['跑后', '热身'], '中', ['小腿']),
  action('kneeling-calf', '跪姿小腿拉伸', 'bilateral', ['跑后'], '中', ['小腿']),
  action('step-calf-hang', '台阶悬垂小腿', 'bilateral', ['跑后'], '中', ['小腿']),
  // ---- stretch: full body ----
  action('full-body-reach', '全身伸展', 'single', ['晨起'], '低', ['全身']),
  action('worlds-greatest', '世界最伟大拉伸', 'bilateral', ['热身'], '中', ['全身', '肩', '髋臀']),
  // ---- warm-up (dynamic) ----
  action('march-in-place', '原地踏步', 'single', ['热身'], '低', ['全身']),
  action('high-knees', '高抬腿', 'single', ['热身'], '中', ['腿', '腰腹']),
  action('jumping-jacks', '开合跳', 'single', ['热身'], '中', ['全身']),
  action('arm-swings', '摆臂绕肩', 'single', ['热身'], '低', ['肩']),
  action('lunge-twist', '弓步转体', 'single', ['热身'], '中', ['腿', '腰腹']),
  action('side-lunge', '侧弓步', 'single', ['热身'], '中', ['腿']),
  action('inchworm', '毛虫爬', 'single', ['热身'], '中', ['全身', '腰腹']),
  action('mountain-climber', '登山跑', 'single', ['热身', '核心'], '高', ['腰腹', '腿']),
  // ---- core (reps, spoken cues) ----
  action('dead-bug-bent', '死虫屈膝版', 'single', ['核心'], '低', ['腰腹']),
  action('dead-bug', '死虫标准版', 'single', ['核心'], '中', ['腰腹']),
  action('dead-bug-slow', '死虫慢速版', 'single', ['核心'], '高', ['腰腹']),
  action('glute-bridge', '臀桥双腿', 'single', ['核心'], '低', ['髋臀', '腰腹']),
  action('glute-bridge-march', '臀桥行进', 'single', ['核心'], '中', ['髋臀', '腰腹']),
  action('single-leg-glute-bridge', '单腿臀桥', 'single', ['核心'], '高', ['髋臀', '腰腹']),
  action('bird-dog', '鸟狗式', 'single', ['核心'], '中', ['腰腹', '背']),
  action('forearm-plank', '前平板', 'single', ['核心'], '中', ['腰腹']),
  action('side-plank', '侧平板', 'single', ['核心'], '高', ['腰腹']),
  action('clamshell', '蚌式', 'single', ['核心'], '中', ['髋臀']),
  action('plank-hip-taps', '平板髋摆动', 'single', ['核心'], '高', ['腰腹']),
];

/** Compact helper: step with no overrides. */
const step = (actionKey: string): SeedRoutineStepDefinition => ({ actionKey });
const cue = (actionKey: string, speakText: string): SeedRoutineStepDefinition => ({
  actionKey,
  speakText,
});

export const SEED_ROUTINES: readonly SeedRoutineDefinition[] = [
  {
    name: '晨起全身拉伸',
    trainingTypeId: 'STRETCH_RELAX',
    category: ['晨起'],
    difficulty: '低',
    bodypart: ['全身'],
    steps: [
      step('neck-side-bend'),
      step('cross-body-shoulder'),
      step('doorway-chest'),
      step('side-bend'),
      step('cat-cow'),
      step('cobra'),
      step('child-pose'),
    ],
  },
  {
    name: '跑后下肢放松',
    trainingTypeId: 'STRETCH_RELAX',
    category: ['跑后'],
    difficulty: '中',
    bodypart: ['腿', '髋臀', '小腿'],
    steps: [
      step('standing-quad'),
      step('seated-hamstring'),
      step('standing-calf'),
      step('kneeling-hip-flexor'),
      step('butterfly'),
    ],
  },
  {
    // Renamed from 办公室肩颈放松 (TASK-012): original 5 + 腰背 4 + 臀腿 3.
    name: '办公室久坐放松',
    trainingTypeId: 'STRETCH_RELAX',
    category: ['办公'],
    difficulty: '低',
    bodypart: ['颈', '肩', '背', '腰腹', '髋臀', '腿'],
    steps: [
      step('neck-side-bend'),
      step('upper-trap'),
      step('levator-scapulae'),
      step('cross-body-shoulder'),
      step('thoracic-rotation'),
      step('cat-cow'),
      step('child-pose'),
      step('supine-spinal-twist'),
      step('side-bend'),
      step('butterfly'),
      step('seated-hamstring'),
      step('figure-four'),
    ],
  },
  {
    name: '睡前全身放松',
    trainingTypeId: 'STRETCH_RELAX',
    category: ['睡前'],
    difficulty: '低',
    bodypart: ['背', '腰腹', '髋臀'],
    steps: [
      step('cat-cow'),
      step('child-pose'),
      step('supine-spinal-twist'),
      step('supine-knee-hug'),
      step('glute-piriformis'),
      step('figure-four'),
      step('butterfly'),
    ],
  },
  {
    name: '5分钟快速热身',
    trainingTypeId: 'WARMUP',
    category: ['热身'],
    difficulty: '低',
    bodypart: ['全身', '肩', '腿'],
    steps: [
      step('shoulder-rolls'),
      step('cross-body-shoulder'),
      step('standing-quad'),
      step('standing-hamstring'),
      step('standing-calf'),
    ],
  },
  {
    // New (TASK-012): 肩颈 5 + 腰背 4 + 臀腿 3.
    name: '久坐办公族拉伸',
    trainingTypeId: 'STRETCH_RELAX',
    category: ['办公'],
    difficulty: '低',
    bodypart: ['颈', '肩', '背', '腰腹', '髋臀', '腿'],
    steps: [
      step('neck-side-bend'),
      step('upper-trap-press'),
      step('levator-scapulae'),
      step('cross-body-shoulder'),
      step('towel-shoulder'),
      step('cat-cow'),
      step('child-pose'),
      step('supine-spinal-twist'),
      step('lat-side-bend'),
      step('butterfly'),
      step('seated-hamstring'),
      step('figure-four'),
    ],
  },
  {
    name: '初级核心',
    trainingTypeId: 'CORE',
    category: ['核心'],
    difficulty: '低',
    bodypart: ['腰腹', '髋臀', '背'],
    defaultTransitionSec: 45,
    steps: [
      cue('dead-bug-bent', '死虫屈膝版，每侧8次'),
      cue('glute-bridge', '臀桥双腿，8次'),
      cue('bird-dog', '鸟狗式，每侧8次'),
    ],
  },
  {
    name: '中级核心',
    trainingTypeId: 'CORE',
    category: ['核心'],
    difficulty: '中',
    bodypart: ['腰腹', '髋臀', '背'],
    defaultTransitionSec: 30,
    steps: [
      cue('dead-bug', '死虫标准版，每侧10次'),
      cue('glute-bridge-march', '臀桥行进，每侧10次'),
      cue('forearm-plank', '前平板，保持30秒'),
      cue('bird-dog', '鸟狗式，每侧10次'),
      cue('clamshell', '蚌式，每侧10次'),
    ],
  },
  {
    name: '高级核心',
    trainingTypeId: 'CORE',
    category: ['核心'],
    difficulty: '高',
    bodypart: ['腰腹', '髋臀', '腿'],
    defaultTransitionSec: 20,
    steps: [
      cue('dead-bug-slow', '死虫慢速版，每侧12次'),
      cue('single-leg-glute-bridge', '单腿臀桥，每侧12次'),
      cue('side-plank', '侧平板，保持30秒'),
      cue('mountain-climber', '登山跑，每侧12次'),
      cue('plank-hip-taps', '平板髋摆动，每侧12次'),
    ],
  },
];

/** Catalog names in a set, for the name-based ownership checks. */
const SEED_ACTION_NAMES = new Set(SEED_ACTIONS.map((definition) => definition.name));
const SEED_ROUTINE_NAMES = new Set(SEED_ROUTINES.map((definition) => definition.name));

/**
 * Shipped routine names that older installs still carry.
 *
 * 办公室肩颈放松 was renamed to 办公室久坐放松 in TASK-012; upgraded devices
 * keep the old row (seeding is additive), so "clear examples" must still be
 * able to remove it by its original name.
 */
const LEGACY_SEED_ROUTINE_NAMES = new Set<string>(['办公室肩颈放松']);

/** `seeded` = rows written now; the other two are no-op outcomes. */
export type SeedOutcome = 'seeded' | 'already-seeded' | 'skipped-user-data' | 'skipped-cleared';

/**
 * Result of the seed repair pass (TASK-009, extended by TASK-010/TASK-012).
 *
 * `not-applicable` = this install never recorded seeding (fresh or user-owned),
 * so repairing is not our business. `intact` = the marker is set and every
 * shipped routine is still present. `repaired` = one or more shipped routines
 * had gone missing and were re-created, leaving everything else untouched.
 * `skipped-cleared` = the user explicitly cleared the examples, so the repair
 * pass must never bring them back (TASK-010 R3).
 */
export interface SeedRepairResult {
  outcome: 'repaired' | 'intact' | 'not-applicable' | 'skipped-cleared';
  /** Names of the shipped routines re-created by this pass, in catalog order. */
  restoredRoutineNames: string[];
}

/** Names of the catalog rows removed by an explicit "clear examples" action. */
export interface ClearSeedResult {
  removedRoutineNames: string[];
  removedActionNames: string[];
}

export interface SeedDependencies {
  db: SqlDatabase;
  /** Real-world timestamps only; seeds never participate in runner timing. */
  clock?: WallClock;
  generateId?: IdGenerator;
}

interface SeedStepRow {
  id: string;
  sourceActionId: string | null;
  displayName: string;
  speakText: string;
  durationSec: number;
  transitionSec: number;
  pairGroupId: string | null;
  side: StepSide;
}

const SEED_ACTION_BY_KEY = new Map(SEED_ACTIONS.map((definition) => [definition.key, definition]));

const DEFAULT_STEP_DEFAULTS = {
  durationSec: clampDuration(DEFAULT_STEP_DURATION_SEC),
  transitionSec: clampTransition(DEFAULT_TRANSITION_SEC),
};

/**
 * Build the snapshot steps for one shipped Action. Bilateral actions expand
 * into a left/right pair through the shared domain helper, so the seeded pairs
 * behave exactly like pairs the user adds from the library (Constitution IX).
 */
function buildSteps(
  definition: SeedActionDefinition,
  actionId: string | null,
  nextId: IdGenerator,
  defaults: { durationSec: number; transitionSec: number },
  overrides?: SeedRoutineStepDefinition,
): SeedStepRow[] {
  const durationSec = clampDuration(overrides?.durationSec ?? defaults.durationSec);
  const transitionSec = clampTransition(overrides?.transitionSec ?? defaults.transitionSec);
  const name = definition.name.trim().slice(0, STEP_NAME_MAX_LENGTH);
  const speakText = (overrides?.speakText ?? definition.speakText ?? definition.name)
    .trim()
    .slice(0, SPEAK_TEXT_MAX_LENGTH);

  if (definition.sideMode === 'bilateral') {
    const pairGroupId = nextId('pair');
    return createBilateralStepDrafts(
      { id: actionId ?? '', name, defaultDurationSec: durationSec, defaultSpeakText: speakText },
      { transitionSec, fallbackDurationSec: durationSec, generateId: nextId, pairGroupId },
    ).map((draft) => ({
      id: draft.id,
      sourceActionId: actionId,
      displayName: draft.displayName,
      speakText: draft.speakText,
      durationSec: draft.durationSec,
      transitionSec: draft.transitionSec,
      pairGroupId: draft.pairGroupId ?? pairGroupId,
      side: draft.side,
    }));
  }

  return [
    {
      id: nextId('step'),
      sourceActionId: actionId,
      displayName: name,
      speakText,
      durationSec,
      transitionSec,
      pairGroupId: null,
      side: 'none',
    },
  ];
}

async function hasSeedMarker(db: SqlDatabase): Promise<boolean> {
  const row = await db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
    SEED_VERSION_KEY,
  ]);
  return row !== null && Number(row.value) >= SEED_VERSION;
}

/** True once the user asked us to remove the shipped examples for good. */
async function hasClearedMarker(db: SqlDatabase): Promise<boolean> {
  const row = await db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
    SEED_EXAMPLES_CLEARED_KEY,
  ]);
  return row?.value === 'true';
}

async function countRows(db: SqlDatabase, table: 'actions' | 'routines'): Promise<number> {
  const row = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return row?.count ?? 0;
}

/**
 * Insert one shipped routine plus its step snapshot. Shared by the initial seed
 * and the repair pass so a restored routine is byte-for-byte the same shape as
 * the one a fresh install gets.
 *
 * `resolveActionId` may return `null` when the referenced library Action is
 * gone (the user deleted it, or an upgraded install never received the newer
 * library actions); `routine_steps.source_action_id` is nullable and the step
 * keeps its own snapshot values, so playback still works.
 */
async function insertSeedRoutine(
  db: SqlDatabase,
  routine: SeedRoutineDefinition,
  resolveActionId: (key: string) => string | null,
  timestamp: string,
  nextId: IdGenerator,
): Promise<void> {
  const defaultTransitionSec = clampTransition(
    routine.defaultTransitionSec ?? DEFAULT_STEP_DEFAULTS.transitionSec,
  );
  const routineId = nextId('rtn');

  await db.run(
    `INSERT INTO routines
       (id, name, default_duration_sec, default_transition_sec, training_type_id, category, difficulty, bodypart, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      routineId,
      routine.name.trim().slice(0, ROUTINE_NAME_MAX_LENGTH),
      DEFAULT_STEP_DEFAULTS.durationSec,
      defaultTransitionSec,
      // Hand-assigned in the definition (HD-5): no name/tag inference here. A
      // foreign key makes a typo'd id fail loudly instead of guessing.
      routine.trainingTypeId,
      joinTagList(routine.category),
      routine.difficulty ?? null,
      joinTagList(routine.bodypart),
      timestamp,
      timestamp,
    ],
  );

  const steps = routine.steps.flatMap((stepSpec) => {
    const definition = SEED_ACTION_BY_KEY.get(stepSpec.actionKey);
    if (!definition) {
      // Only reachable if the catalog itself is inconsistent; fail the
      // transaction rather than silently saving an incomplete routine.
      throw new Error(`种子数据缺少动作定义：${stepSpec.actionKey}`);
    }
    return buildSteps(
      definition,
      resolveActionId(stepSpec.actionKey),
      nextId,
      { durationSec: DEFAULT_STEP_DEFAULTS.durationSec, transitionSec: defaultTransitionSec },
      stepSpec,
    );
  });

  for (const [index, step] of steps.entries()) {
    await db.run(
      `INSERT INTO routine_steps
         (id, routine_id, source_action_id, order_index, display_name, speak_text,
          duration_sec, transition_sec, pair_group_id, side)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        step.id,
        routineId,
        step.sourceActionId,
        index,
        step.displayName,
        step.speakText,
        step.durationSec,
        step.transitionSec,
        step.pairGroupId,
        step.side,
      ],
    );
  }
}

/**
 * Seed once, atomically. Order of checks matters:
 *
 * 1. `seed_version` already stored -> nothing to do (re-entry is a no-op).
 * 2. `actions` or `routines` already holds rows -> it is the user's data, so we
 *    back off completely instead of mixing our content into it.
 * 3. otherwise write the whole library inside one transaction and only then
 *    record `seed_version`, so a failure can never leave a half-seeded library
 *    that later looks like user data.
 */
export async function runSeeds(deps: SeedDependencies): Promise<SeedOutcome> {
  const { db } = deps;
  const clock = deps.clock ?? new SystemWallClock();
  const nextId = deps.generateId ?? generateId;

  if (await hasSeedMarker(db)) {
    return 'already-seeded';
  }

  // A user who cleared the examples must not get them back through a re-seed.
  if (await hasClearedMarker(db)) {
    return 'skipped-cleared';
  }

  const [actionCount, routineCount] = await Promise.all([
    countRows(db, 'actions'),
    countRows(db, 'routines'),
  ]);
  if (actionCount > 0 || routineCount > 0) {
    return 'skipped-user-data';
  }

  const now = new Date(clock.nowMs()).toISOString();

  await db.transaction(async () => {
    const actionIdByKey = new Map<string, string>();

    for (const definition of SEED_ACTIONS) {
      const id = nextId('act');
      const name = definition.name.trim().slice(0, ROUTINE_NAME_MAX_LENGTH);
      const speakText = (definition.speakText ?? definition.name)
        .trim()
        .slice(0, SPEAK_TEXT_MAX_LENGTH);
      actionIdByKey.set(definition.key, id);
      await db.run(
        `INSERT INTO actions
           (id, name, default_duration_sec, side_mode, default_speak_text,
            category, difficulty, bodypart, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          DEFAULT_STEP_DEFAULTS.durationSec,
          definition.sideMode,
          speakText,
          joinTagList(definition.category),
          definition.difficulty ?? null,
          joinTagList(definition.bodypart),
          now,
          now,
        ],
      );
    }

    for (const routine of SEED_ROUTINES) {
      await insertSeedRoutine(db, routine, (key) => actionIdByKey.get(key) ?? null, now, nextId);
    }

    await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
      SEED_VERSION_KEY,
      String(SEED_VERSION),
    ]);
  });

  return 'seeded';
}

/** Existing routine names, used to spot a shipped routine the user deleted. */
async function listRoutineNames(db: SqlDatabase): Promise<Set<string>> {
  const rows = await db.all<{ name: string }>('SELECT name FROM routines');
  return new Set(rows.map((row) => row.name));
}

/** Map each shipped Action name to the library row that still owns it. */
async function mapSeedActionIdsByName(db: SqlDatabase): Promise<Map<string, string>> {
  const wanted = new Set(SEED_ACTIONS.map((definition) => definition.name));
  const rows = await db.all<{ id: string; name: string }>('SELECT id, name FROM actions');
  const byName = new Map<string, string>();
  for (const row of rows) {
    if (wanted.has(row.name)) {
      byName.set(row.name, row.id);
    }
  }
  return byName;
}

/**
 * TASK-009 repair pass: bring back a shipped example routine the user deleted.
 *
 * `runSeeds` is one-shot by design (`seed_version`), which also meant a routine
 * that disappeared *after* the first launch could never come back. This pass
 * runs on every boot and is deliberately narrow:
 *
 * - only installs that already recorded seeding are eligible, so a fresh
 *   install and a user-owned library are both left alone;
 * - a shipped routine counts as present by its catalog name, so an existing
 *   (even user-edited) routine is never duplicated or overwritten;
 * - only the missing routines are re-created, each with a fresh step snapshot
 *   linked to the matching library Action when it still exists.
 */
export async function repairSeededRoutines(deps: SeedDependencies): Promise<SeedRepairResult> {
  const { db } = deps;
  const clock = deps.clock ?? new SystemWallClock();
  const nextId = deps.generateId ?? generateId;

  if (!(await hasSeedMarker(db))) {
    return { outcome: 'not-applicable', restoredRoutineNames: [] };
  }

  // Explicitly-cleared installs opted out of the examples: never resurrect them.
  if (await hasClearedMarker(db)) {
    return { outcome: 'skipped-cleared', restoredRoutineNames: [] };
  }

  const presentNames = await listRoutineNames(db);
  const missing = SEED_ROUTINES.filter((routine) => !presentNames.has(routine.name));
  if (missing.length === 0) {
    return { outcome: 'intact', restoredRoutineNames: [] };
  }

  const actionIdByName = await mapSeedActionIdsByName(db);
  const now = new Date(clock.nowMs()).toISOString();

  await db.transaction(async () => {
    for (const routine of missing) {
      await insertSeedRoutine(
        db,
        routine,
        (key) => {
          const definition = SEED_ACTION_BY_KEY.get(key);
          return definition ? actionIdByName.get(definition.name) ?? null : null;
        },
        now,
        nextId,
      );
    }
  });

  return { outcome: 'repaired', restoredRoutineNames: missing.map((routine) => routine.name) };
}

/**
 * TASK-010 R3: explicitly remove the shipped examples from Settings.
 *
 * Reuses the repair pass's name-based ownership rule, so it removes exactly the
 * catalog-named rows and nothing else: a routine or action the user renamed is
 * no longer "the shipped one" and is never touched, and rows the user created
 * themselves do not match the catalog at all.
 *
 * Deletion and the cleared marker happen in one transaction. The marker keeps
 * `repairSeededRoutines` from resurrecting the examples on the next boot; the
 * one-shot `seed_version` marker is deliberately left in place so `runSeeds`
 * still treats the install as already seeded (the whole flow is idempotent:
 * running it twice simply removes nothing the second time).
 */
export async function clearSeededExamples(deps: SeedDependencies): Promise<ClearSeedResult> {
  const { db } = deps;

  const routineRows = await db.all<{ id: string; name: string }>('SELECT id, name FROM routines');
  const removedRoutines = routineRows.filter(
    (row) => SEED_ROUTINE_NAMES.has(row.name) || LEGACY_SEED_ROUTINE_NAMES.has(row.name),
  );
  const actionRows = await db.all<{ id: string; name: string }>('SELECT id, name FROM actions');
  const removedActions = actionRows.filter((row) => SEED_ACTION_NAMES.has(row.name));

  await db.transaction(async () => {
    for (const routine of removedRoutines) {
      await db.run('DELETE FROM routine_steps WHERE routine_id = ?', [routine.id]);
      await db.run('DELETE FROM routines WHERE id = ?', [routine.id]);
    }

    for (const action of removedActions) {
      // User steps keep their own snapshot values; only the now-dangling link
      // to the removed library Action is cleared.
      await db.run('UPDATE routine_steps SET source_action_id = NULL WHERE source_action_id = ?', [
        action.id,
      ]);
      await db.run('DELETE FROM actions WHERE id = ?', [action.id]);
    }

    await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
      SEED_EXAMPLES_CLEARED_KEY,
      'true',
    ]);
  });

  return {
    removedRoutineNames: removedRoutines.map((row) => row.name),
    removedActionNames: removedActions.map((row) => row.name),
  };
}
