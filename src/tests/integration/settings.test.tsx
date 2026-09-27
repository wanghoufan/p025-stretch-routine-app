import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { act } from '@testing-library/react-native';
import { runSeeds } from '../../data/seeds';
import { renderApp } from '../support/renderApp';
import { createTestContext } from '../support/testContext';
import { createTestSpeaker } from '../support/fixtures';
import { advanceTime, press, type as typeText } from '../support/interaction';

type AlertButton = { text?: string; style?: string; onPress?: () => void };

/**
 * US7 independent test (T083, T086): change a setting, restart the app, and
 * confirm it persists and affects new playback/defaults.
 */
describe('US7 设置 (T083/T084/T086)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function toggle(testID: string, value: boolean) {
    await act(async () => {
      fireEvent(screen.getByTestId(testID), 'valueChange', value);
    });
  }

  it('persists a changed setting across a restart', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();

    const first = renderApp({
      services: context.services,
      speaker,
      initialRoute: { name: 'Settings', params: undefined },
    });

    await screen.findByText('语音');
    await toggle('settings-tts-enabled', false);
    await press('settings-default-duration-plus');
    await press('settings-default-duration-plus');

    first.unmount();

    // "Restart the app": same local database, fresh render.
    renderApp({
      services: context.services,
      speaker,
      initialRoute: { name: 'Settings', params: undefined },
    });

    expect(await screen.findByTestId('settings-default-duration')).toBeTruthy();
    expect(screen.getByTestId('settings-default-duration-value')).toHaveTextContent('40s');

    const stored = await context.services.settings.load();
    expect(stored.ttsEnabled).toBe(false);
    expect(stored.defaultDurationSec).toBe(40);

    context.dispose();
  });

  it('applies stored default duration/transition to new routine drafts', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();
    await context.services.settings.save({
      ...(await context.services.settings.load()),
      defaultDurationSec: 45,
      defaultTransitionSec: 15,
    });

    renderApp({ services: context.services, speaker });
    await screen.findByText('还没有流程');

    await press('home-new-routine');
    await screen.findByTestId('routine-name-input');

    expect(screen.getByTestId('routine-default-duration-value')).toHaveTextContent('45s');
    expect(screen.getByTestId('routine-default-transition-value')).toHaveTextContent('15s');

    await typeText('routine-name-input', '默认值流程');
    await press('routine-save');
    // No steps yet, so the save rule rejects the draft.
    expect(await screen.findByText('请至少添加一个动作')).toBeTruthy();

    context.dispose();
  });

  it('applies a stored default to the steps created by batch input', async () => {
    const context = await createTestContext();
    await context.services.settings.save({
      ...(await context.services.settings.load()),
      defaultDurationSec: 45,
      defaultTransitionSec: 0,
    });

    renderApp({ services: context.services, speaker: createTestSpeaker() });
    await screen.findByText('还没有流程');

    await press('home-new-routine');
    await screen.findByTestId('routine-name-input');
    await typeText('routine-name-input', '批量默认值');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('batch-input'), 'A');
    });
    await press('batch-add');
    await press('routine-save');

    const routines = await context.services.routines.list();
    const loaded = await context.services.routines.getWithSteps(routines[0]!.id);
    expect(loaded?.steps[0]?.durationSec).toBe(45);
    expect(loaded?.steps[0]?.transitionSec).toBe(0);

    context.dispose();
  });

  it('silences speech when TTS is disabled, while the runner keeps timing', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();
    await context.services.settings.save({
      ...(await context.services.settings.load()),
      ttsEnabled: false,
    });

    const seeded = await context.services.routines.create({
      name: '静音流程',
      defaultDurationSec: 10,
      defaultTransitionSec: 0,
      steps: [
        { displayName: 'A', durationSec: 10, transitionSec: 0 },
        { displayName: 'B', durationSec: 10, transitionSec: 0 },
      ],
    });

    renderApp({ services: context.services, speaker });
    await screen.findByText('共 1 个流程');
    await press(`routine-start-${seeded.routine.id}`);
    await screen.findByTestId('runner-current-step');

    advanceTime(context, 10_000);

    // Timing still advances to step B, but nothing is spoken.
    expect(screen.getByTestId('runner-current-step')).toHaveTextContent('B');
    expect(speaker.spoken).toEqual([]);

    context.dispose();
  });

  it('applies the stored countdown warning setting at runtime', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();
    await context.services.settings.save({
      ...(await context.services.settings.load()),
      countdownWarningEnabled: true,
      countdownWarningSec: 5,
    });

    const seeded = await context.services.routines.create({
      name: '提示流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
    });

    renderApp({ services: context.services, speaker });
    await screen.findByText('共 1 个流程');
    await press(`routine-start-${seeded.routine.id}`);
    await screen.findByTestId('runner-current-step');

    // Cross into the 5 second window without crossing the step boundary.
    advanceTime(context, 26_000);

    expect(speaker.spoken).toEqual(['A，30秒', '4秒后结束']);

    context.dispose();
  });

  it('clears seeded examples after confirmation and keeps user content (TASK-010)', async () => {
    const context = await createTestContext();
    await runSeeds({
      db: context.db,
      clock: context.clock,
      generateId: context.services.generateId,
    });
    const ownAction = await context.services.actions.create({
      name: '我的动作',
      defaultDurationSec: 45,
      sideMode: 'single',
    });

    const spy = jest.spyOn(Alert, 'alert') as unknown as jest.SpyInstance<
      void,
      [string, string?, AlertButton[]?]
    >;
    spy.mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Settings', params: undefined },
    });

    await screen.findByText('示例数据');
    await press('settings-clear-examples');

    expect(await screen.findByText(/已清除 9 个示例流程、59 个示例动作/)).toBeTruthy();
    expect(await context.services.routines.list()).toHaveLength(0);
    const remaining = await context.services.actions.list();
    expect(remaining.map((action) => action.name)).toEqual(['我的动作']);
    expect((await context.services.actions.getById(ownAction.id))?.name).toBe('我的动作');

    jest.restoreAllMocks();
    context.dispose();
  });
});
