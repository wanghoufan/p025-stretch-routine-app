import { createAppServices, initializeAppDatabase, type AppServices } from '../../app/providers/createAppServices';
import type { ActiveSession } from '../../domain/session/ActiveSession';
import { createStartRoutineService, type StartRoutineService } from '../../features/runner/services/startRoutineService';
import { FakeClock, FakeMonotonicClock } from '../../services/clock';
import { FakeBootInfoProvider } from '../../services/runtime/BootInfo';
import { FakeProcessTerminationProvider } from '../../services/runtime/Termination';
import { createManualTicker, type ManualTicker } from '../../services/ticker/ticker';
import { createSequentialIdGenerator } from '../../shared/utils/id';
import { createNodeSqlDatabase, type NodeSqlDatabase } from './nodeSqlDatabase';

/**
 * A fully wired app against a real (in-memory) SQLite database, fake clocks and
 * a manual ticker. Nothing here touches native modules or real timers.
 *
 * `clock` is the wall clock and `monotonic` the authoritative runner clock; the
 * integration helper `advanceTime` moves both together so a test can simulate
 * real time passing without conflating the two.
 */
export interface TestContext {
  services: AppServices;
  db: NodeSqlDatabase;
  clock: FakeClock;
  monotonic: FakeMonotonicClock;
  ticker: ManualTicker;
  dispose: () => void;
}

export async function createTestContext(nowMs = 1_700_000_000_000): Promise<TestContext> {
  const db = createNodeSqlDatabase();
  const clock = new FakeClock(nowMs);
  const monotonic = new FakeMonotonicClock(0);
  const ticker = createManualTicker();

  const services = createAppServices({
    db,
    wallClock: clock,
    monotonic,
    bootInfo: new FakeBootInfoProvider(1),
    termination: new FakeProcessTerminationProvider({ trusted: true, lastReason: null }),
    ticker,
    generateId: createSequentialIdGenerator(),
  });

  await initializeAppDatabase(services);

  return {
    services,
    db,
    clock,
    monotonic,
    ticker,
    dispose: () => db.close(),
  };
}

/** Convenience for assertions: the active session, or null. */
export async function loadActiveSession(services: AppServices): Promise<ActiveSession | null> {
  const loaded = await services.sessions.loadActive();
  return loaded.status === 'ok' ? loaded.session : null;
}

/** Build the start service over the test app, for arranging preconditions. */
export function createTestStartService(services: AppServices): StartRoutineService {
  return createStartRoutineService({
    routines: services.routines,
    sessions: services.sessions,
    monotonic: services.monotonic,
    wallClock: services.wallClock,
    bootInfo: services.bootInfo,
    history: services.history,
    generateId: services.generateId,
  });
}
