import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import {
  applyRunnerControl,
  advanceRunner,
  startRunner,
} from '../../features/runner/domain/runnerMachine';
import type { ActiveSession } from '../../domain/session/ActiveSession';
import { makeSteps, createTestSpeaker } from '../support/fixtures';
import { press } from '../support/interaction';
import { renderApp } from '../support/renderApp';
import { createTestContext, type TestContext } from '../support/testContext';

type AlertButton = { text?: string; style?: string; onPress?: () => void };

/**
 * TASK-021-B2: history & stats UI.
 *
 * The screen only reads the B1 repository interface (never its internals), so
 * every test arranges history by driving the trusted archive entry point on a
 * real in-memory SQLite database.
 */

const STEPS = makeSteps([
  ['动作A', 30, 5],
  ['动作B', 20, 0],
]); // 50s of actual action time when completed

const OFFSET = -480; // UTC+8
const T = 1_790_000_000_000; // arbitrary wall base; dates are display-only

interface ArchiveOptions {
  sessionId: string;
  routineName: string;
  trainingTypeId: string | null;
  endedAtWallMs: number;
}

async function archiveSession(
  context: TestContext,
  { sessionId, routineName, trainingTypeId, endedAtWallMs }: ArchiveOptions,
  settle: (started: ActiveSession) => ActiveSession,
): Promise<void> {
  const started = startRunner({
    sessionId,
    routineId: `routine-${sessionId}`,
    routineName,
    steps: STEPS,
    nowElapsedMs: 0,
    wallMs: endedAtWallMs - 3_600_000,
    bootCount: 1,
    trainingTypeId,
  });
  const terminal = settle(started.session);
  await context.services.sessions.create(terminal);
  await context.services.history.archiveAndClear(terminal, {
    endWallMs: endedAtWallMs,
    endTimezoneOffsetMin: OFFSET,
  });
}

function archiveCompleted(context: TestContext, options: ArchiveOptions): Promise<void> {
  return archiveSession(context, options, (session) => advanceRunner(session, STEPS, 55_500).session);
}

function archiveStopped(context: TestContext, options: ArchiveOptions, stopAtMs: number): Promise<void> {
  return archiveSession(context, options, (session) =>
    applyRunnerControl(session, STEPS, { type: 'END' }, stopAtMs).session,
  );
}

/** Confirm whatever Alert is opened by pressing its destructive button. */
function spyDestructiveAlert(): jest.SpyInstance {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style === 'destructive')?.onPress?.();
  }) as unknown as jest.SpyInstance;
}

describe('history & stats screen (TASK-021-B2)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the honest empty state when nothing has been recorded yet', async () => {
    const context = await createTestContext();
    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Stats', params: undefined },
    });

    expect(await screen.findByText('暂无训练记录')).toBeTruthy();
    expect(screen.getByText(/统计从新版本开始记录/)).toBeTruthy();
    expect(screen.getByText('数据仅保存在本机，不上传')).toBeTruthy();
    // No totals / buckets are fabricated for an empty history.
    expect(screen.queryByTestId('stats-total-value')).toBeNull();
    expect(screen.queryByTestId('stats-type-unclassified')).toBeNull();

    context.dispose();
  });

  it('opens the stats screen from the home content area (no 4th tab)', async () => {
    const context = await createTestContext();
    renderApp({ services: context.services, speaker: createTestSpeaker() });

    await screen.findByText('还没有流程');
    await press('home-history-stats');

    expect(await screen.findByText('暂无训练记录')).toBeTruthy();

    context.dispose();
  });

  it('aggregates totals and per-type buckets consistently, including 未分类', async () => {
    const context = await createTestContext();
    await archiveCompleted(context, {
      sessionId: 's1',
      routineName: '晨间拉伸',
      trainingTypeId: 'STRETCH_RELAX',
      endedAtWallMs: T + 1_000,
    });
    await archiveStopped(
      context,
      {
        sessionId: 's2',
        routineName: '核心速练',
        trainingTypeId: 'CORE',
        endedAtWallMs: T + 2_000,
      },
      10_000,
    );
    await archiveCompleted(context, {
      sessionId: 's3',
      routineName: '自建混合',
      trainingTypeId: null,
      endedAtWallMs: T + 3_000,
    });

    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Stats', params: undefined },
    });

    // 50s + 10s + 50s = 110s of actual action time.
    expect(await screen.findByTestId('stats-total-value')).toHaveTextContent('1分50秒');
    expect(screen.getByTestId('stats-total-count')).toHaveTextContent('共 3 次训练');

    // Bucket names come from the training_types table, NULL = 未分类, and the
    // three buckets sum exactly to the grand total.
    expect(screen.getByTestId('stats-type-STRETCH_RELAX')).toHaveTextContent('拉伸放松', { exact: false });
    expect(screen.getByTestId('stats-type-STRETCH_RELAX')).toHaveTextContent('50秒', { exact: false });
    expect(screen.getByTestId('stats-type-CORE')).toHaveTextContent('核心训练', { exact: false });
    expect(screen.getByTestId('stats-type-CORE')).toHaveTextContent('10秒', { exact: false });
    expect(screen.getByTestId('stats-type-WARMUP')).toHaveTextContent('热身', { exact: false });
    expect(screen.getByTestId('stats-type-unclassified')).toHaveTextContent('未分类', { exact: false });
    expect(screen.getByTestId('stats-type-unclassified')).toHaveTextContent('50秒', { exact: false });

    // Recent records: snapshot name, actual time, and the early-end flag.
    expect(screen.getByTestId('stats-recent-s1')).toHaveTextContent('晨间拉伸', { exact: false });
    expect(screen.getByTestId('stats-recent-s1')).toHaveTextContent('50秒', { exact: false });
    expect(screen.getByTestId('stats-recent-s2')).toHaveTextContent('提前结束', { exact: false });
    expect(screen.getByTestId('stats-recent-s1')).not.toHaveTextContent('提前结束', { exact: false });

    context.dispose();
  });

  it('shows the caveat only while anomalies are open, and dismissing keeps totals', async () => {
    const context = await createTestContext();
    await archiveCompleted(context, {
      sessionId: 's1',
      routineName: '晨间拉伸',
      trainingTypeId: 'STRETCH_RELAX',
      endedAtWallMs: T + 1_000,
    });

    // No anomalies -> no caveat (expected exclusions never trigger one either,
    // because B1 never persists them as notices).
    const first = renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Stats', params: undefined },
    });
    expect(await screen.findByTestId('stats-total-value')).toHaveTextContent('50秒', { exact: false });
    expect(screen.queryByTestId('stats-anomaly-banner')).toBeNull();
    first.unmount();

    await context.services.history.recordAnomaly('recovery-stale', { wallMs: T });

    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Stats', params: undefined },
    });
    expect(await screen.findByTestId('stats-anomaly-banner')).toBeTruthy();
    expect(screen.getByText('存在未计入的异常，合计可能低于实际练习')).toBeTruthy();
    expect(screen.getByText('上次训练搁置太久，有一段未能计入统计')).toBeTruthy();

    await press('stats-anomaly-dismiss');

    expect(screen.queryByTestId('stats-anomaly-banner')).toBeNull();
    // Dismissing the notice never rewrites the numbers.
    expect(screen.getByTestId('stats-total-value')).toHaveTextContent('50秒', { exact: false });
    expect(await context.services.history.listActiveAnomalies()).toHaveLength(0);

    context.dispose();
  });

  it('deletes a single record after confirmation and recalculates totals', async () => {
    const context = await createTestContext();
    await archiveCompleted(context, {
      sessionId: 's1',
      routineName: '晨间拉伸',
      trainingTypeId: 'STRETCH_RELAX',
      endedAtWallMs: T + 1_000,
    });
    await archiveCompleted(context, {
      sessionId: 's2',
      routineName: '核心速练',
      trainingTypeId: 'CORE',
      endedAtWallMs: T + 2_000,
    });
    spyDestructiveAlert();

    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Stats', params: undefined },
    });

    expect(await screen.findByTestId('stats-total-value')).toHaveTextContent('1分40秒');

    await press('stats-delete-s1');

    expect(screen.queryByTestId('stats-recent-s1')).toBeNull();
    expect(screen.getByTestId('stats-recent-s2')).toBeTruthy();
    expect(screen.getByTestId('stats-total-value')).toHaveTextContent('50秒', { exact: false });
    expect(screen.getByTestId('stats-total-count')).toHaveTextContent('共 1 次训练');
    expect(await context.services.history.getTotals()).toEqual({
      totalStepMs: 50_000,
      sessionCount: 1,
    });

    context.dispose();
  });

  it('clears all statistics from settings and leaves routines untouched', async () => {
    const context = await createTestContext();
    const own = await context.services.routines.create({
      name: '我的流程',
      defaultDurationSec: 30,
      defaultTransitionSec: 0,
      steps: [{ displayName: 'A', durationSec: 30, transitionSec: 0 }],
    });
    await archiveCompleted(context, {
      sessionId: 's1',
      routineName: '晨间拉伸',
      trainingTypeId: 'STRETCH_RELAX',
      endedAtWallMs: T + 1_000,
    });
    spyDestructiveAlert();

    const first = renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Settings', params: undefined },
    });

    await screen.findByText('示例数据');
    // The two destructive entries must be clearly distinct (HD-4).
    expect(screen.getByText('清除示例数据')).toBeTruthy();
    expect(screen.getByText('清空统计数据')).toBeTruthy();

    await press('settings-clear-stats');
    expect(await screen.findByText('已清空全部训练统计。')).toBeTruthy();

    expect(await context.services.history.getTotals()).toEqual({
      totalStepMs: 0,
      sessionCount: 0,
    });
    expect(await context.services.routines.getById(own.routine.id)).not.toBeNull();
    first.unmount();

    renderApp({
      services: context.services,
      speaker: createTestSpeaker(),
      initialRoute: { name: 'Stats', params: undefined },
    });
    expect(await screen.findByText('暂无训练记录')).toBeTruthy();

    context.dispose();
  });

  it('switches language instantly across entry, copy and training-type names', async () => {
    const context = await createTestContext();
    await archiveCompleted(context, {
      sessionId: 's1',
      routineName: '晨间拉伸',
      trainingTypeId: 'STRETCH_RELAX',
      endedAtWallMs: T + 1_000,
    });
    await archiveStopped(
      context,
      {
        sessionId: 's2',
        routineName: '核心速练',
        trainingTypeId: 'CORE',
        endedAtWallMs: T + 2_000,
      },
      10_000,
    );

    renderApp({ services: context.services, speaker: createTestSpeaker() });
    await screen.findByText('还没有流程');

    // Home -> Settings -> switch to English -> back -> stats, all in one tree:
    // proves the switch takes effect immediately, not on a remount.
    await press('home-settings');
    await screen.findAllByText('语言');
    await press('settings-language-en');
    await act(async () => {
      fireEvent.press(screen.getByText('Back'));
    });
    await press('home-history-stats');

    expect(await screen.findByText('History & Stats')).toBeTruthy();
    expect(screen.getByText('Total Active Time')).toBeTruthy();
    expect(screen.getByTestId('stats-total-value')).toHaveTextContent('1m');
    expect(screen.getByTestId('stats-total-count')).toHaveTextContent('Total sessions: 2');
    expect(screen.getByText('Stretch & Relax')).toBeTruthy();
    expect(screen.getByText('Core Training')).toBeTruthy();
    expect(screen.getByText('Last 10 Sessions')).toBeTruthy();
    expect(screen.getByText('Ended early')).toBeTruthy();
    expect(
      screen.getByText('Data is stored on this device only — never uploaded'),
    ).toBeTruthy();

    context.dispose();
  });
});
