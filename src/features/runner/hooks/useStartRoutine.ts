import { useCallback, useMemo, useState } from 'react';
import type { AppServices } from '../../../app/providers/createAppServices';
import type { AppSettings } from '../../settings/settingsModel';
import type { TtsService } from '../../../services/tts/ttsService';
import { buildCues } from '../services/runnerCueCoordinator';
import { createStartRoutineService, type StartResult } from '../services/startRoutineService';
import type { RunnerEvent } from '../domain/runnerMachine';
import type { ActiveSession } from '../../../domain/session/ActiveSession';

/**
 * Start/continue/conflict flow for the Home and Routine Detail screens
 * (R014–R018).
 *
 * The three-way conflict choice is modelled as explicit state instead of a
 * native `Alert`, so it can be rendered, pressed and asserted in tests — and so
 * the user always sees which routine is currently running before replacing it.
 *
 * Announcing the first cue belongs to the *explicit* Start/Continue action:
 * automatic recovery of a stored session stays silent (R012).
 */
export type StartFlowState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'conflict'; routineId: string; currentRoutineName: string }
  | { status: 'error'; message: string };

export interface UseStartRoutineResult {
  state: StartFlowState;
  /** Ask to start `routineId`. May resolve to a conflict instead of starting. */
  start: (routineId: string) => Promise<void>;
  /** Conflict choice 1: keep the current session and go to the Runner. */
  continueCurrent: () => Promise<void>;
  /** Conflict choice 2: end the current session and start the requested one. */
  replaceCurrent: () => Promise<void>;
  /** Conflict choice 3: do nothing. */
  cancel: () => void;
  /** Continue straight into the running session (Home Banner). */
  resume: () => Promise<void>;
  dismissError: () => void;
}

export function useStartRoutine(
  services: AppServices,
  tts: TtsService,
  settings: AppSettings,
  onOpenRunner: () => void,
): UseStartRoutineResult {
  const [state, setState] = useState<StartFlowState>({ status: 'idle' });

  const service = useMemo(
    () =>
      createStartRoutineService({
        routines: services.routines,
        sessions: services.sessions,
        monotonic: services.monotonic,
        wallClock: services.wallClock,
        bootInfo: services.bootInfo,
        history: services.history,
        generateId: services.generateId,
      }),
    [services],
  );

  const announce = useCallback(
    (session: ActiveSession, events: readonly RunnerEvent[]) => {
      if (events.length === 0) {
        return;
      }
      const cues = buildCues({
        session,
        steps: session.snapshot.steps,
        events,
        settings,
        nowElapsedMs: services.monotonic.nowElapsedMs(),
      });
      if (cues.length > 0) {
        tts.announceAll(cues);
      }
    },
    [services, settings, tts],
  );

  const handle = useCallback(
    (result: StartResult, requestedRoutineId?: string): void => {
      switch (result.kind) {
        case 'started':
        case 'continue-current':
          announce(result.session, result.events);
          setState({ status: 'idle' });
          onOpenRunner();
          break;
        case 'conflict':
          // Remember what the user *asked for* — that is what "结束当前并开始新的"
          // must start, not the routine that is currently running.
          setState({
            status: 'conflict',
            routineId: requestedRoutineId ?? result.current.routineId,
            currentRoutineName: result.current.routineName,
          });
          break;
        case 'failed':
          setState({ status: 'error', message: result.error });
          break;
        default:
          break;
      }
    },
    [announce, onOpenRunner],
  );

  const start = useCallback(
    async (routineId: string) => {
      setState({ status: 'busy' });
      handle(await service.start(routineId), routineId);
    },
    [service, handle],
  );

  const continueCurrent = useCallback(async () => {
    setState({ status: 'busy' });
    handle(await service.continueCurrent());
  }, [service, handle]);

  const replaceCurrent = useCallback(async () => {
    if (state.status !== 'conflict') {
      return;
    }
    const { routineId } = state;
    setState({ status: 'busy' });
    handle(await service.replaceWith(routineId));
  }, [service, handle, state]);

  const resume = useCallback(async () => {
    setState({ status: 'busy' });
    handle(await service.continueCurrent());
  }, [service, handle]);

  const cancel = useCallback(() => setState({ status: 'idle' }), []);
  const dismissError = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, continueCurrent, replaceCurrent, cancel, resume, dismissError };
}
