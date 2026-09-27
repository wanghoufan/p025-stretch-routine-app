import type { SqlDatabase } from '../../data/db/Database';
import { ExpoSqlDatabase } from '../../data/db/expoSqlDatabase';
import { runMigrations } from '../../data/migrations';
import { runSeeds, repairSeededRoutines, type SeedOutcome, type SeedRepairResult } from '../../data/seeds';
import { createActionRepository, type ActionRepository } from '../../data/repositories/actionRepository';
import { createRoutineRepository, type RoutineRepository } from '../../data/repositories/routineRepository';
import { createSessionRepository, type SessionRepository } from '../../data/repositories/sessionRepository';
import { createSettingsKeyValueStore } from '../../data/repositories/settingsKeyValueStore';
import { createSettingsRepository, type SettingsRepository } from '../../features/settings/settingsRepository';
import { SystemWallClock, DeviceMonotonicClock, type MonotonicClock, type WallClock } from '../../services/clock';
import { DeviceBootInfoProvider, type BootInfoProvider } from '../../services/runtime/BootInfo';
import {
  ExpoGoProcessTerminationProvider,
  type ProcessTerminationProvider,
} from '../../services/runtime/Termination';
import { createSystemTicker, type Ticker } from '../../services/ticker/ticker';
import { generateId, type IdGenerator } from '../../shared/utils/id';

/** How often the runner re-renders. Presentation only (Constitution V). */
export const DEFAULT_TICK_INTERVAL_MS = 250;

/**
 * Composition root for the local-only data layer.
 *
 * The whole app shares one `AppServices` instance, which is also what makes the
 * integration tests able to swap in an in-memory / Node SQLite database and a
 * manual ticker.
 *
 * Two clocks, never interchangeable (R007):
 *  - `wallClock`   -> createdAt/updatedAt and display age;
 *  - `monotonic`   -> authoritative runner elapsed time.
 */
export interface AppServices {
  db: SqlDatabase;
  wallClock: WallClock;
  monotonic: MonotonicClock;
  bootInfo: BootInfoProvider;
  termination: ProcessTerminationProvider;
  ticker: Ticker;
  tickIntervalMs: number;
  actions: ActionRepository;
  routines: RoutineRepository;
  sessions: SessionRepository;
  settings: SettingsRepository;
  generateId: IdGenerator;
}

export interface CreateAppServicesOptions {
  db?: SqlDatabase;
  wallClock?: WallClock;
  monotonic?: MonotonicClock;
  bootInfo?: BootInfoProvider;
  termination?: ProcessTerminationProvider;
  ticker?: Ticker;
  tickIntervalMs?: number;
  generateId?: IdGenerator;
}

export function createAppServices(options: CreateAppServicesOptions = {}): AppServices {
  const db = options.db ?? new ExpoSqlDatabase();
  const wallClock = options.wallClock ?? new SystemWallClock();
  const idGenerator = options.generateId ?? generateId;

  return {
    db,
    wallClock,
    monotonic: options.monotonic ?? new DeviceMonotonicClock(),
    bootInfo: options.bootInfo ?? new DeviceBootInfoProvider(),
    termination: options.termination ?? new ExpoGoProcessTerminationProvider(),
    ticker: options.ticker ?? createSystemTicker(),
    tickIntervalMs: options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS,
    actions: createActionRepository({ db, clock: wallClock, generateId: idGenerator }),
    routines: createRoutineRepository({ db, clock: wallClock, generateId: idGenerator }),
    sessions: createSessionRepository(db),
    settings: createSettingsRepository(createSettingsKeyValueStore(db)),
    generateId: idGenerator,
  };
}

/** Bring the local schema up to date. Safe to call on every launch. */
export async function initializeAppDatabase(services: AppServices): Promise<number> {
  return runMigrations(services.db);
}

export interface AppInitialization {
  schemaVersion: number;
  seed: SeedOutcome;
  seedRepair: SeedRepairResult;
}

/**
 * Full boot sequence: schema first, then the one-time seed library (TASK-005),
 * then the narrow repair pass (TASK-009) that restores a shipped example
 * routine deleted after seeding.
 *
 * Seeding is a no-op once `seed_version` is stored or as soon as the device
 * holds user data, so upgrading an existing install never injects content.
 */
export async function initializeApp(services: AppServices): Promise<AppInitialization> {
  const schemaVersion = await initializeAppDatabase(services);
  const seedDeps = {
    db: services.db,
    clock: services.wallClock,
    generateId: services.generateId,
  };
  const seed = await runSeeds(seedDeps);
  const seedRepair = await repairSeededRoutines(seedDeps);
  return { schemaVersion, seed, seedRepair };
}
