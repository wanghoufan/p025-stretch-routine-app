import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useServices } from '../../../app/providers/ServicesContext';
import { useSettings } from '../../../app/providers/SettingsContext';
import { useSpeech } from '../../../app/providers/SpeechContext';
import { useAmbientPlayer } from '../../../app/providers/AmbientContext';
import { AmbientAudioService } from '../../../services/audio/ambientAudioService';
import {
  createAppStateVisibilitySource,
  type AppVisibilitySource,
} from '../../../services/background/backgroundService';
import { RunnerController } from '../services/runnerController';
import { createSessionPersistence } from '../services/sessionPersistence';
import { deriveRunnerView, type RunnerView } from '../services/runnerView';
import { useRunnerLifecycle } from './useRunnerLifecycle';
import type { RunnerControl } from '../domain/runnerMachine';

/**
 * React binding for the runner (R019).
 *
 * The hook owns no timing logic and no routine id: it wires the controller to
 * the stored ActiveSession, the ticker, app visibility and the current
 * settings, then exposes an immutable view.
 */
export interface UseRunnerOptions {
  /** Injectable for tests / non-device targets. */
  visibilitySource?: AppVisibilitySource;
}

export interface UseRunnerResult {
  view: RunnerView;
  togglePause: () => void;
  addTime: () => void;
  previous: () => void;
  skip: () => void;
  end: () => void;
}

export function useRunner(options: UseRunnerOptions = {}): UseRunnerResult {
  const services = useServices();
  const { settings } = useSettings();
  const { tts } = useSpeech();
  const ambientPlayer = useAmbientPlayer();

  const visibilitySource = useMemo(
    () => options.visibilitySource ?? createAppStateVisibilitySource(),
    [options.visibilitySource],
  );

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const controller = useMemo(() => {
    const persistence = createSessionPersistence({
      repository: services.sessions,
      wallClock: services.wallClock,
      history: services.history,
    });
    const ambient = new AmbientAudioService({ player: ambientPlayer });
    return new RunnerController({
      persistence,
      monotonic: services.monotonic,
      bootInfo: services.bootInfo,
      termination: services.termination,
      tts,
      ambient,
      settings: settingsRef.current,
      history: services.history,
    });
  }, [services, tts, ambientPlayer]);

  useEffect(() => {
    void controller.load();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    controller.setSettings(settings);
  }, [controller, settings]);

  const tick = useCallback(() => controller.tick(), [controller]);

  useEffect(() => {
    return services.ticker.start(tick, services.tickIntervalMs);
  }, [services, tick]);

  const onForeground = useCallback(() => {
    // Catch up immediately: the user may have been away across several steps.
    controller.tick();
  }, [controller]);

  const onBackground = useCallback(() => {
    controller.tick();
  }, [controller]);

  useRunnerLifecycle({ source: visibilitySource, onForeground, onBackground });

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  const view = useMemo(() => deriveRunnerView(snapshot), [snapshot]);

  const send = useCallback((control: RunnerControl) => controller.control(control), [controller]);

  return {
    view,
    togglePause: useCallback(() => controller.togglePause(), [controller]),
    addTime: useCallback(() => send({ type: 'ADD_TIME' }), [send]),
    previous: useCallback(() => send({ type: 'PREVIOUS' }), [send]),
    skip: useCallback(() => send({ type: 'SKIP' }), [send]),
    end: useCallback(() => send({ type: 'END' }), [send]),
  };
}
