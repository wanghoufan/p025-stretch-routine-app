import { screen } from '@testing-library/react-native';
import { renderApp } from '../support/renderApp';
import { createTestContext, loadActiveSession } from '../support/testContext';
import { createTestSpeaker } from '../support/fixtures';
import { advanceTime, press } from '../support/interaction';

/**
 * US1 independent test (T046): seed one routine, tap Start, make the fake clock
 * cross every boundary, and verify ordered completion.
 */
describe('US1 自动播放到完成 (T046)', () => {
  it('runs the steps in order, speaks the cues, and reaches the completion screen', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();

    const seeded = await context.services.routines.create({
      name: '早间流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 5,
      steps: [
        { displayName: 'A', durationSec: 10, transitionSec: 5 },
        { displayName: 'B', durationSec: 20, transitionSec: 0 },
        { displayName: 'C', durationSec: 30, transitionSec: 0 },
      ],
    });

    renderApp({ services: context.services, speaker });

    // Home -> Start.
    await screen.findByText('共 1 个流程');
    await press(`routine-start-${seeded.routine.id}`);

    // The runner opens on the first step, counting down from its full duration.
    expect(await screen.findByTestId('runner-current-step')).toHaveTextContent('A');
    expect(screen.getByTestId('runner-remaining')).toHaveTextContent('0:10');
    expect(screen.getByText('第 1 / 3 个')).toBeTruthy();
    expect(screen.getByTestId('runner-next-step')).toHaveTextContent('下一个：B');

    // t=10s: step A ends, the 5s transition prepares B.
    advanceTime(context, 10_000);
    expect(screen.getByTestId('runner-current-step')).toHaveTextContent('准备下一个动作');
    expect(screen.getByTestId('runner-phase')).toHaveTextContent('过渡中 · 接着做 B');

    // t=15s: step B starts.
    advanceTime(context, 5_000);
    expect(screen.getByTestId('runner-current-step')).toHaveTextContent('B');
    expect(screen.getByText('第 2 / 3 个')).toBeTruthy();

    // t=35s: step B has no transition, so step C starts directly.
    advanceTime(context, 20_000);
    expect(screen.getByTestId('runner-current-step')).toHaveTextContent('C');
    expect(screen.getByText('第 3 / 3 个')).toBeTruthy();
    expect(screen.queryByTestId('runner-next-step')).toBeNull();

    // t=65s: the routine completes and the completion screen appears. HD-6:
    // the duration is the actual action time (10+20+30s), transitions excluded.
    advanceTime(context, 30_000);
    expect(await screen.findByText('流程完成')).toBeTruthy();
    expect(screen.getByTestId('completion-routine-name')).toHaveTextContent('早间流程');
    expect(screen.getByTestId('completion-summary')).toHaveTextContent('共 3 个动作 · 用时 1分');
    expect(screen.getByTestId('completion-action-time-note')).toBeTruthy();
    // The archive committed before the screen appeared.
    expect(screen.getByTestId('completion-counted')).toBeTruthy();
    expect(await context.services.history.getTotals()).toEqual({
      totalStepMs: 60_000,
      sessionCount: 1,
    });

    // Cues were spoken in playback order: start, next-up, start, start, complete.
    expect(speaker.spoken).toEqual([
      'A，10秒',
      '下一个，B',
      'B，20秒',
      'C，30秒',
      '流程完成',
    ]);

    // A finished routine leaves no session to recover.
    expect(await loadActiveSession(context.services)).toBeNull();

    // Done returns to Home.
    await press('completion-done');
    expect(await screen.findByText('共 1 个流程')).toBeTruthy();

    context.dispose();
  });

  it('keeps progressing from authoritative time when a whole gap is skipped', async () => {
    const context = await createTestContext();
    const speaker = createTestSpeaker();

    const seeded = await context.services.routines.create({
      name: '跳跃测试',
      defaultDurationSec: 10,
      defaultTransitionSec: 0,
      steps: [
        { displayName: 'A', durationSec: 10, transitionSec: 0 },
        { displayName: 'B', durationSec: 10, transitionSec: 0 },
        { displayName: 'C', durationSec: 10, transitionSec: 0 },
      ],
    });

    renderApp({ services: context.services, speaker });
    await screen.findByText('共 1 个流程');
    await press(`routine-start-${seeded.routine.id}`);
    await screen.findByTestId('runner-current-step');

    // A single tick after 25 seconds of being away lands on step C.
    advanceTime(context, 25_000);
    expect(screen.getByTestId('runner-current-step')).toHaveTextContent('C');
    expect(screen.getByTestId('runner-remaining')).toHaveTextContent('0:05');
    // Passed cues are not replayed: only the current step was announced.
    expect(speaker.spoken).toEqual(['A，10秒', 'C，10秒']);

    context.dispose();
  });

  it('shows a safe state instead of crashing when nothing is running', async () => {
    const context = await createTestContext();
    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Runner', params: undefined },
    });

    expect(await screen.findByText('无法继续流程')).toBeTruthy();
    context.dispose();
  });
});
