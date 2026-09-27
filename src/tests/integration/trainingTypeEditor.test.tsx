import { screen } from '@testing-library/react-native';
import { runSeeds } from '../../data/seeds';
import { renderApp } from '../support/renderApp';
import { createTestContext } from '../support/testContext';
import { createTestSpeaker } from '../support/fixtures';
import { press, type } from '../support/interaction';
import { saveRoutine } from '../../features/routines/services/saveRoutine';

/**
 * TASK-021-B3 (V1.3 HD-1/HD-5): the routine editor's training-type picker.
 *
 * Covered here:
 * - options are table-driven (an extra `training_types` row appears without
 *   any code change — the UI never hardcodes the three preset ids);
 * - new routines default to 未分类 and save the selected type;
 * - edits echo the stored type; an explicit 未分类 saves a real `null`
 *   (re-classify) while an omitted field keeps the stored value;
 * - the mixed-routine classification caveat is visible in zh and en;
 * - all nine seed routines render with their approved V1.3 mapping in the UI
 *   ("5分钟快速热身" = WARMUP).
 */

/** Mirrors the approved mapping table in PRODUCT_PLAN_V1.3 verbatim. */
const SEED_TYPE_MAPPING: readonly (readonly [name: string, typeId: string])[] = [
  ['晨起全身拉伸', 'STRETCH_RELAX'],
  ['久坐办公族拉伸', 'STRETCH_RELAX'],
  ['跑后下肢放松', 'STRETCH_RELAX'],
  ['办公室久坐放松', 'STRETCH_RELAX'],
  ['睡前全身放松', 'STRETCH_RELAX'],
  ['5分钟快速热身', 'WARMUP'],
  ['初级核心', 'CORE'],
  ['中级核心', 'CORE'],
  ['高级核心', 'CORE'],
];

const EDITOR_ROUTE = { name: 'RoutineEditor' as const, params: {} };

type Context = Awaited<ReturnType<typeof createTestContext>>;

async function storedTypeId(context: Context, routineId: string): Promise<string | null> {
  const row = await context.db.get<{ training_type_id: string | null }>(
    'SELECT training_type_id FROM routines WHERE id = ?',
    [routineId],
  );
  return row?.training_type_id ?? null;
}

function expectSelected(typeId: string) {
  expect(screen.getByTestId(`routine-type-${typeId}`).props.accessibilityState.selected).toBe(true);
}

describe('training type picker in the routine editor (TASK-021-B3)', () => {
  it('lists options from the training_types table plus 未分类, defaulting to 未分类', async () => {
    const context = await createTestContext();

    // A type that ships in a LATER version: if the picker were a hardcoded
    // list of the three presets, this row could not show up.
    await context.db.run(
      `INSERT INTO training_types (type_id, name_zh, name_en, sort_order, is_builtin, is_active)
       VALUES ('LOWER_BODY', '下肢训练', 'Lower Body', 4, 0, 1)`,
    );

    renderApp({ services: context.services, speaker: createTestSpeaker(), initialRoute: EDITOR_ROUTE });

    expect(await screen.findByTestId('routine-type-STRETCH_RELAX')).toBeTruthy();
    // Table rows arrive asynchronously; wait for the first one before asserting.
    await screen.findByTestId('routine-type-STRETCH_RELAX');
    for (const testID of [
      'routine-type-STRETCH_RELAX',
      'routine-type-WARMUP',
      'routine-type-CORE',
      'routine-type-LOWER_BODY',
      'routine-type-unclassified',
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    // Labels come from the table (zh column), not from a hardcoded list.
    expect(screen.getByText('下肢训练')).toBeTruthy();
    expect(screen.getByTestId('routine-type-unclassified').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('routine-type-WARMUP').props.accessibilityState.selected).toBe(false);

    context.dispose();
  });

  it('creates an unclassified routine by default and stores an explicitly chosen type', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();

    // Default path: no type touched -> NULL in the database.
    const first = renderApp({ services: context.services, speaker, initialRoute: EDITOR_ROUTE });
    await screen.findByTestId('routine-type-STRETCH_RELAX');
    await type('routine-name-input', '自建流程');
    await type('batch-input', 'A\nB');
    await press('batch-add');
    await press('routine-save-footer');
    first.unmount();
    const created = await context.services.routines.list();
    expect(created).toHaveLength(1);
    expect(await storedTypeId(context, created[0]!.id)).toBeNull();

    // Explicit path: WARMUP selected before saving.
    const second = renderApp({ services: context.services, speaker, initialRoute: EDITOR_ROUTE });
    await screen.findByTestId('routine-type-STRETCH_RELAX');
    await type('routine-name-input', '热身流程');
    await type('batch-input', 'A');
    await press('batch-add');
    await press('routine-type-WARMUP');
    await press('routine-save-footer');
    second.unmount();
    const all = await context.services.routines.list();
    const warmup = all.find((routine) => routine.name === '热身流程');
    expect(warmup).toBeDefined();
    expect(await storedTypeId(context, warmup!.id)).toBe('WARMUP');

    context.dispose();
  });

  it('echoes the stored type when editing and re-classifies via explicit 未分类', async () => {
    const context = await createTestContext();
    const created = await context.services.routines.create({
      name: '核心流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      trainingTypeId: 'CORE',
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 5 }],
    });
    const editorRoute = { name: 'RoutineEditor' as const, params: { routineId: created.routine.id } };

    // Echo: the editor opens with CORE selected.
    const first = renderApp({ services: context.services, speaker: createTestSpeaker(), initialRoute: editorRoute });
    await screen.findByTestId('routine-type-STRETCH_RELAX');
    expectSelected('CORE');

    // Switch to another type and save -> stored.
    await press('routine-type-WARMUP');
    await press('routine-save');
    first.unmount();
    expect(await storedTypeId(context, created.routine.id)).toBe('WARMUP');

    // Re-open, pick 未分类 -> an explicit `null` re-classifies the routine.
    const second = renderApp({ services: context.services, speaker: createTestSpeaker(), initialRoute: editorRoute });
    await screen.findByTestId('routine-type-STRETCH_RELAX');
    expectSelected('WARMUP');
    await press('routine-type-unclassified');
    await press('routine-save');
    second.unmount();
    expect(await storedTypeId(context, created.routine.id)).toBeNull();

    context.dispose();
  });

  it('keeps the stored type when trainingTypeId is omitted from the draft (B1 contract)', async () => {
    const context = await createTestContext();
    const created = await context.services.routines.create({
      name: '保留类型',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      trainingTypeId: 'STRETCH_RELAX',
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 5 }],
    });

    // A draft without the field (e.g. a caller that does not know about
    // training types) must not silently wipe the classification.
    await saveRoutine(context.services.routines, {
      routineId: created.routine.id,
      name: '保留类型',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      category: [],
      steps: [{ ...created.steps[0]!, displayName: 'A 改名' }],
    });
    expect(await storedTypeId(context, created.routine.id)).toBe('STRETCH_RELAX');

    context.dispose();
  });

  it('shows the mixed-routine classification caveat in Chinese and English', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();

    // Default (Chinese) UI.
    const zh = renderApp({ services: context.services, speaker, initialRoute: EDITOR_ROUTE });
    expect(await screen.findByTestId('routine-type-STRETCH_RELAX')).toBeTruthy();
    expect(screen.getByText(
      '一个流程里可以混有不同类型的动作；整场训练的时长都会计入这里所选的类型。',
    )).toBeTruthy();
    expect(screen.getByText('训练类型')).toBeTruthy();
    expect(screen.getByText('未分类')).toBeTruthy();
    zh.unmount();

    // English UI: the stored language preference drives the same keys.
    const settings = await context.services.settings.load();
    await context.services.settings.save({ ...settings, app_language: 'en' });
    const en = renderApp({ services: context.services, speaker, initialRoute: EDITOR_ROUTE });
    expect(await screen.findByText(
      'A routine can mix actions of different types; the whole session counts toward the training type selected here.',
    )).toBeTruthy();
    expect(screen.getByText('Training Type')).toBeTruthy();
    expect(screen.getByText('Unclassified')).toBeTruthy();
    en.unmount();

    context.dispose();
  });

  it('renders each of the nine seed routines with its approved mapping in the editor', async () => {
    const context = await createTestContext();
    expect(
      await runSeeds({ db: context.db, clock: context.clock, generateId: context.services.generateId }),
    ).toBe('seeded');

    const routines = await context.services.routines.list();
    for (const [name, typeId] of SEED_TYPE_MAPPING) {
      const routine = routines.find((candidate) => candidate.name === name);
      expect(routine).toBeDefined();

      const app = renderApp({
        services: context.services,
        speaker: createTestSpeaker(),
        initialRoute: { name: 'RoutineEditor' as const, params: { routineId: routine!.id } },
      });
      await screen.findByTestId('routine-type-STRETCH_RELAX');
      // The DB value equals the plan mapping AND the UI reflects it.
      expect(await storedTypeId(context, routine!.id)).toBe(typeId);
      expectSelected(typeId);
      app.unmount();
    }

    context.dispose();
  });
});
