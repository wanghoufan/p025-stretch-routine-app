import { Alert } from 'react-native';
import { screen } from '@testing-library/react-native';
import { startRunner } from '../../features/runner/domain/runnerMachine';
import type { ActiveSession } from '../../domain/session/ActiveSession';
import { createTestSpeaker, makeSteps } from '../support/fixtures';
import { advanceTime, press } from '../support/interaction';
import { renderApp } from '../support/renderApp';
import { createTestContext, loadActiveSession, type TestContext } from '../support/testContext';

/**
 * TASK-021-B4: completion screen duration caliber (HD-6), archive outcome
 * display, retry entry and the stop-confirmation fact fix — all driven
 * through the real UI on a real in-memory SQLite database.
 */

async function startRoutineFromHome(
  context: TestContext,
  steps: readonly (readonly [name: string, durationSec: number, transitionSec?: number])[],
  homeText = '共 1 个流程',
): Promise<void> {
  const seeded = await context.services.routines.create({
    name: '完成页测试',
    defaultDurationSec: 10,
    defaultTransitionSec: 0,
    steps: steps.map(([displayName, durationSec, transitionSec]) => ({
      displayName,
      durationSec,
      transitionSec: transitionSec ?? 0,
    })),
  });
  renderApp({ services: context.services, speaker: createTestSpeaker() });
  await screen.findByText(homeText);
  await press(`routine-start-${seeded.routine.id}`);
  await screen.findByTestId('runner-current-step');
}

describe('completion screen: duration caliber, outcome and retry (TASK-021-B4)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Confirm the stop dialog by tapping its destructive (结束) button. */
  function mockStopConfirmation(): void {
    jest.spyOn(Alert, 'alert').mockImplementation(
      ((_title: string, _message?: string, buttons?: { style?: string; onPress?: () => void }[]) => {
        buttons?.find((button) => button.style === 'destructive')?.onPress?.();
      }) as never,
    );
  }

  it('keeps a successful early stop going straight home (review P1-2: no extra step)', async () => {
    const context = await createTestContext();
    await startRoutineFromHome(context, [['A', 10], ['B', 10]]);
    mockStopConfirmation();

    advanceTime(context, 15_000);
    await press('runner-end');

    // Archived on the spot: back to Home, never through the completion screen.
    expect(await screen.findByText('共 1 个流程')).toBeTruthy();
    expect(screen.queryByTestId('completion-summary')).toBeNull();
    expect(await context.services.history.getTotals()).toEqual({
      totalStepMs: 15_000,
      sessionCount: 1,
    });
    expect(await loadActiveSession(context.services)).toBeNull();

    context.dispose();
  });

  it('routes a failed early-stop archive to the completion screen with a working retry (review P1-2 closure)', async () => {
    const context = await createTestContext();
    await startRoutineFromHome(context, [['A', 10], ['B', 10]]);
    const spy = jest.spyOn(context.services.history, 'archiveAndClear');
    spy.mockRejectedValueOnce(new Error('injected archive failure'));
    mockStopConfirmation();

    advanceTime(context, 15_000);
    await press('runner-end');

    // The failure lands on the completion screen: the session's actual action
    // time (10s step A + 5s partial step B) is shown with the retry entry.
    expect(await screen.findByTestId('completion-retry-area')).toBeTruthy();
    expect(screen.getByText('统计尚未保存，可重试保存。')).toBeTruthy();
    expect(screen.getByTestId('completion-summary')).toHaveTextContent('共 2 个动作 · 用时 15秒');
    // The failed transaction kept the terminal STOPPED row (nothing lost yet).
    const stored = await loadActiveSession(context.services);
    expect(stored?.state).toBe('STOPPED');

    // Retry archives the stopped session; Done then leaves for Home.
    spy.mockRestore();
    await press('completion-retry');
    expect(await screen.findByTestId('completion-counted')).toBeTruthy();
    expect(await context.services.history.getTotals()).toEqual({
      totalStepMs: 15_000,
      sessionCount: 1,
    });
    expect(await loadActiveSession(context.services)).toBeNull();
    await press('completion-done');
    expect(await screen.findByText('共 1 个流程')).toBeTruthy();

    context.dispose();
  });

  it('offers a working retry entry when the archive fails (closure for stats.anomaly.archive-failed)', async () => {
    const context = await createTestContext();
    await startRoutineFromHome(context, [['A', 10], ['B', 10]]);

    // The first archive attempt fails: the completion screen must report the
    // failure and keep the session retryable.
    const spy = jest.spyOn(context.services.history, 'archiveAndClear');
    spy.mockRejectedValueOnce(new Error('injected archive failure'));

    advanceTime(context, 20_000);
    expect(await screen.findByTestId('completion-retry-area')).toBeTruthy();
    expect(screen.getByText('统计尚未保存，可重试保存。')).toBeTruthy();
    expect(screen.queryByTestId('completion-counted')).toBeNull();
    // The failed transaction kept the terminal row (nothing was lost yet).
    const stored = await loadActiveSession(context.services);
    expect(stored?.state).toBe('COMPLETED');

    // Retry through the completion screen entry point.
    spy.mockRestore();
    await press('completion-retry');
    expect(await screen.findByTestId('completion-counted')).toBeTruthy();
    expect(await context.services.history.getTotals()).toEqual({
      totalStepMs: 20_000,
      sessionCount: 1,
    });
    expect(await loadActiveSession(context.services)).toBeNull();

    context.dispose();
  });

  it('shows the neutral pre-upgrade exclusion and never an anomaly notice', async () => {
    const context = await createTestContext();
    const started = startRunner({
      sessionId: 'legacy-1',
      routineId: 'routine-legacy',
      routineName: '升级前流程',
      steps: makeSteps([['A', 10], ['B', 10]]),
      nowElapsedMs: 0,
      wallMs: context.clock.nowMs(),
      bootCount: 1,
    });
    const legacy: ActiveSession = { ...started.session, statsEligible: false };
    await context.services.sessions.create(legacy);

    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Runner', params: undefined },
    });
    await screen.findByTestId('runner-current-step');
    advanceTime(context, 20_000);

    expect(await screen.findByTestId('completion-exclusion')).toHaveTextContent(
      '更新前开始的训练不计入新统计',
      { exact: false },
    );
    expect(screen.queryByTestId('completion-counted')).toBeNull();
    expect(screen.getByTestId('completion-summary')).toHaveTextContent('共 2 个动作 · 用时 0秒');
    // Expected exclusions are not losses: no notice, no caveat, nothing counted.
    expect(await context.services.history.listActiveAnomalies()).toEqual([]);
    expect(await context.services.history.getTotals()).toEqual({
      totalStepMs: 0,
      sessionCount: 0,
    });

    context.dispose();
  });

  it('explains the neutral no-action-time and terminal-error exclusions from the outcome', async () => {
    const context = await createTestContext();
    // These two outcomes have no live UI path today (0ms sessions cannot
    // snapshot — B1 rejects zero-duration steps — and ERROR lands on Home),
    // so the exclusion mapping is exercised through the screen's own params.
    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: {
        name: 'Completion',
        params: {
          routineId: 'routine-x',
          routineName: '零时长流程',
          stepCount: 2,
          actionMs: 0,
          outcome: { status: 'excluded', reason: 'no-action-time' },
        },
      },
    });

    expect(await screen.findByTestId('completion-exclusion')).toHaveTextContent(
      '本次没有可计入的动作时间',
      { exact: false },
    );
    expect(screen.queryByTestId('completion-counted')).toBeNull();
    // No retry entry for an expected exclusion: nothing failed.
    expect(screen.queryByTestId('completion-retry-area')).toBeNull();
    screen.unmount();

    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: {
        name: 'Completion',
        params: {
          routineId: 'routine-y',
          routineName: '异常流程',
          stepCount: 3,
          actionMs: 5_000,
          outcome: { status: 'excluded', reason: 'terminal-error' },
        },
      },
    });
    expect(await screen.findByTestId('completion-exclusion')).toHaveTextContent(
      '本次训练出现异常，未计入统计',
      { exact: false },
    );
    expect(screen.queryByTestId('completion-retry-area')).toBeNull();

    context.dispose();
  });

  it('no longer claims that finished parts are not saved (stop-confirmation fact fix)', async () => {
    const context = await createTestContext();
    await startRoutineFromHome(context, [['A', 10], ['B', 10]]);

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(((_title: string, _message?: string) => {}) as never);

    await press('runner-end');

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message] = alertSpy.mock.calls[0]!;
    expect(title).toBe('结束流程');
    expect(message).toContain('提前结束也会计入统计');
    expect(message).not.toContain('不会保存');

    context.dispose();
  });

  it('renders the runner and completion copy in English when the stored language is en', async () => {
    const context = await createTestContext();
    const current = await context.services.settings.load();
    await context.services.settings.save({ ...current, app_language: 'en' });

    await startRoutineFromHome(context, [['A', 10]], '1 routines total');

    expect(screen.getByText('Action 1 of 1')).toBeTruthy();
    expect(screen.getByText(/Elapsed \(incl\. transitions\)/)).toBeTruthy();

    advanceTime(context, 10_000);
    expect(await screen.findByText('Routine Complete')).toBeTruthy();
    expect(screen.getByTestId('completion-summary')).toHaveTextContent('1 actions · 10s');
    expect(screen.getByTestId('completion-action-time-note')).toHaveTextContent(
      /actual action time only/,
    );
    expect(screen.getByTestId('completion-counted')).toHaveTextContent('Counted in your statistics');

    context.dispose();
  });
});
