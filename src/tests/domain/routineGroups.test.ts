import type { RoutineSummary } from '../../domain/routine/Routine';
import {
  groupRoutines,
  UNCLASSIFIED_SCENE,
  type TrainingTypeNames,
} from '../../features/routines/services/routineGroups';

function makeRoutine(
  overrides: Partial<RoutineSummary> & { name: string },
): RoutineSummary {
  return {
    id: overrides.name,
    defaultDurationSec: 30,
    defaultTransitionSec: 0,
    stepCount: 1,
    totalDurationSec: 30,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

/** The three built-in training types as the `training_types` table reports them. */
const BUILTIN_TYPES: TrainingTypeNames = {
  STRETCH_RELAX: '拉伸放松',
  WARMUP: '热身',
  CORE: '核心训练',
};

describe('首页按训练类型分组 (TASK-021-F2)', () => {
  it('按 training_type_id 分组，组名取自类型表', () => {
    const routines = [
      makeRoutine({ name: '晨起全身拉伸', trainingTypeId: 'STRETCH_RELAX' }),
      makeRoutine({ name: '跑后下肢放松', trainingTypeId: 'STRETCH_RELAX' }),
      makeRoutine({ name: '5分钟快速热身', trainingTypeId: 'WARMUP' }),
      makeRoutine({ name: '初级核心', trainingTypeId: 'CORE' }),
    ];

    const groups = groupRoutines(routines, BUILTIN_TYPES, '未分类');

    expect(groups.map((g) => g.name)).toEqual(['拉伸放松', '热身', '核心训练']);
    expect(groups.map((g) => g.count)).toEqual([2, 1, 1]);
    expect(groups[0].routines.map((r) => r.name)).toEqual(['晨起全身拉伸', '跑后下肢放松']);
  });

  it('不按 category 标签猜场景——旧标签不再影响首页分组', () => {
    // 「健身前后」这类名字是旧规则从 category 猜出来的，V1.3 之后不再存在。
    const routines = [
      makeRoutine({ name: '办公室久坐放松', trainingTypeId: 'STRETCH_RELAX', category: ['办公'] }),
      makeRoutine({ name: '睡前全身放松', trainingTypeId: 'STRETCH_RELAX', category: ['睡前'] }),
    ];

    const groups = groupRoutines(routines, BUILTIN_TYPES, '未分类');

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('拉伸放松');
  });

  it('隐藏空组', () => {
    const groups = groupRoutines(
      [makeRoutine({ name: '初级核心', trainingTypeId: 'CORE' })],
      BUILTIN_TYPES,
      '未分类',
    );
    expect(groups.map((g) => g.scene)).toEqual(['CORE']);
  });

  it('没有训练类型的流程落入未分类兜底，且不丢失', () => {
    const groups = groupRoutines(
      [
        makeRoutine({ name: '用户自建流程' }),
        makeRoutine({ name: '初级核心', trainingTypeId: 'CORE' }),
      ],
      BUILTIN_TYPES,
      '未分类',
    );

    expect(groups.map((g) => g.scene)).toEqual(['CORE', UNCLASSIFIED_SCENE]);
    expect(groups[1].name).toBe('未分类');
    expect(groups[1].routines.map((r) => r.name)).toEqual(['用户自建流程']);
  });

  it('指向未知类型 id 的流程也进未分类，不静默消失', () => {
    const groups = groupRoutines(
      [makeRoutine({ name: '脏数据', trainingTypeId: 'DELETED_TYPE' })],
      BUILTIN_TYPES,
      '未分类',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].scene).toBe(UNCLASSIFIED_SCENE);
  });

  it('新增一个类型行即自动多出一栏（表驱动，非硬编码）', () => {
    const extended: TrainingTypeNames = { ...BUILTIN_TYPES, UPPER_BODY: '上肢训练' };
    const groups = groupRoutines(
      [
        makeRoutine({ name: '肩背训练', trainingTypeId: 'UPPER_BODY' }),
        makeRoutine({ name: '初级核心', trainingTypeId: 'CORE' }),
      ],
      extended,
      '未分类',
    );
    // 空组被隐藏：拉伸放松/热身在本例无流程，只有两类各成一栏。
    expect(groups.map((g) => g.name)).toEqual(['核心训练', '上肢训练']);
  });

  it('分组顺序跟随类型表声明顺序，而非字母序', () => {
    const reordered: TrainingTypeNames = {
      CORE: '核心训练',
      WARMUP: '热身',
      STRETCH_RELAX: '拉伸放松',
    };
    const groups = groupRoutines(
      [
        makeRoutine({ name: '晨起全身拉伸', trainingTypeId: 'STRETCH_RELAX' }),
        makeRoutine({ name: '5分钟快速热身', trainingTypeId: 'WARMUP' }),
        makeRoutine({ name: '初级核心', trainingTypeId: 'CORE' }),
      ],
      reordered,
      '未分类',
    );
    expect(groups.map((g) => g.scene)).toEqual(['CORE', 'WARMUP', 'STRETCH_RELAX']);
  });

  it('key 稳定可测，且不含旧中文场景名', () => {
    const groups = groupRoutines(
      [
        makeRoutine({ name: '初级核心', trainingTypeId: 'CORE' }),
        makeRoutine({ name: '自建', trainingTypeId: null }),
      ],
      BUILTIN_TYPES,
      '未分类',
    );
    expect(groups.map((g) => g.key)).toEqual([
      'routine-group-CORE',
      'routine-group-unclassified',
    ]);
  });

  it('空流程列表返回空分组', () => {
    expect(groupRoutines([], BUILTIN_TYPES, '未分类')).toEqual([]);
  });
});
