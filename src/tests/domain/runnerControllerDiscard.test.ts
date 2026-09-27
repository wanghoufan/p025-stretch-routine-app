import { RunnerController } from '../../features/runner/services/runnerController';
import { createSessionPersistence } from '../../features/runner/services/sessionPersistence';
import { AmbientAudioService } from '../../services/audio/ambientAudioService';
import { TtsService } from '../../services/tts/ttsService';
import { DEFAULT_SETTINGS } from '../../features/settings/settingsModel';
import { startRunner } from '../../features/runner/domain/runnerMachine';
import type { SessionHistoryRepository } from '../../data/repositories/sessionHistoryRepository';
import { createTestContext, type TestContext } from '../support/testContext';
import { createTestAmbientPlayer, createTestSpeaker, makeSteps } from '../support/fixtures';

/**
 * TASK-021-B1 rework (P1-2): when recovery discards a stored session, the
 * anomalous-loss notice must be persisted BEFORE the row is cleared — and a
 * failed notice write keeps the row and surfaces the error instead of
 * silently losing both the time and the notice (V1.3 DoD).
 */

const STEPS = makeSteps([['动作A', 10, 0]]);

async function seedUnresumableSession(context: TestContext) {
  const started = startRunner({
    sessionId: 'ses-discard',
    routineId: 'routine-1',
    routineName: '流程R',
    steps: STEPS,
    nowElapsedMs: 0,
    wallMs: context.clock.nowMs(),
    // A previous boot owns the elapsed origin: recovery must discard.
    bootCount: 999,
    trainingTypeId: null,
  });
  await context.services.sessions.create(started.session);
  return started.session;
}

function buildController(
  context: TestContext,
  history?: Pick<SessionHistoryRepository, 'recordAnomaly' | 'archiveAndClear'>,
): RunnerController {
  return new RunnerController({
    persistence: createSessionPersistence({
      repository: context.services.sessions,
      wallClock: context.services.wallClock,
      history,
    }),
    monotonic: context.services.monotonic,
    bootInfo: context.services.bootInfo,
    termination: context.services.termination,
    tts: new TtsService({
      speaker: createTestSpeaker(),
      isEnabled: () => true,
      getRate: () => 1,
    }),
    ambient: new AmbientAudioService({ player: createTestAmbientPlayer() }),
    settings: { ...DEFAULT_SETTINGS },
    history,
  });
}

describe('RunnerController recovery discard (TASK-021-B1 rework, P1-2)', () => {
  it('persists the anomaly notice before clearing a discarded session', async () => {
    const context = await createTestContext();
    const session = await seedUnresumableSession(context);

    const controller = buildController(context, context.services.history);
    await controller.load();

    expect(controller.getSnapshot().status).toBe('missing');
    const notices = await context.services.history.listActiveAnomalies();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.reasonCode).toBe('recovery-boot-changed');
    expect(notices[0]?.sessionId).toBe(session.sessionId);
    expect(await context.services.sessions.loadActive()).toEqual({ status: 'none' });

    controller.dispose();
    context.dispose();
  });

  it('keeps the row and surfaces the error when the notice write fails', async () => {
    const context = await createTestContext();
    const session = await seedUnresumableSession(context);

    const controller = buildController(context, {
      recordAnomaly: async () => {
        throw new Error('notice write failed');
      },
      archiveAndClear: async () => {
        throw new Error('not used on this path');
      },
    });
    await controller.load();

    // The failure is exposed to the caller, not swallowed...
    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().errorMessage).toContain('notice write failed');
    // ...and the stored session survives for a retry.
    const loaded = await context.services.sessions.loadActive();
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.session.sessionId).toBe(session.sessionId);
    }
    expect(await context.services.history.listActiveAnomalies()).toEqual([]);

    controller.dispose();
    context.dispose();
  });
});
