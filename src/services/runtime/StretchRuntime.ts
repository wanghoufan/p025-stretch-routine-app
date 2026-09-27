/**
 * Bridge to the local `stretch-runtime` Android module (R006).
 *
 * The module is the only place in the app that is allowed to read the device's
 * own monotonic uptime and boot identity. It exists because neither value can
 * be derived from anything JavaScript already has:
 *
 *  - `nowElapsedMs` -> `SystemClock.elapsedRealtime()` (kernel `CLOCK_BOOTTIME`):
 *    keeps counting through Doze/deep sleep and never moves when the wall clock
 *    is changed.
 *  - `getBootCount` -> `Settings.Global.BOOT_COUNT`: the system's per-boot
 *    counter, constant for a whole boot and incremented only by a real reboot.
 *
 * Every accessor returns `null` when the module is absent (Expo Go, Jest, web)
 * or when the platform withholds a trustworthy value, so callers can apply
 * their own fallback instead of crashing on a dev/CI runtime.
 *
 * ── Lookup is cached once per process (R006 P1-1) ──────────────────────────
 * The result of the (optional, guarded) native lookup is memoised for the whole
 * lifetime of the process — success *and* failure. Two reasons:
 *   1. **Observability**: a degraded run must not be silent. The first failed
 *      lookup emits exactly one `console.warn` (greppable tag `[stretch-runtime]`)
 *      so a release build that lost its native module is visible in logcat
 *      instead of quietly producing wrong statistics.
 *   2. **Stable time origin**: `elapsedRealtime()` is `CLOCK_BOOTTIME` (counts
 *      deep sleep) while the JS fallback `performance.now()` is `CLOCK_MONOTONIC`
 *      (does not). They are *different epochs*. Re-looking-up on every call could
 *      flip the source mid-process and make `nowElapsedMs()` appear to move
 *      backwards, so the source is pinned for the whole process.
 * Callers use `__resetStretchRuntimeLookupForTest()` to simulate a fresh process.
 */
export interface StretchRuntimeNativeModule {
  /** Milliseconds since boot (`SystemClock.elapsedRealtime`). */
  nowElapsedMs(): number;
  /** Device boot counter; `-1` means "not available". */
  getBootCount(): number;
}

const MODULE_NAME = 'StretchRuntime';

/** Stable, greppable logcat tag: `adb logcat | grep stretch-runtime`. */
const LOG_TAG = '[stretch-runtime]';

type NativeLookup =
  | { module: StretchRuntimeNativeModule; reason?: undefined }
  | { module: null; reason: string };

/**
 * The one guarded lookup. Lazily required, same pattern as the audio/TTS
 * adapters, so pure-JS tests never pull `expo` into their import graph.
 * `requireOptionalNativeModule` returns `null` rather than throwing, but a
 * broken install can still surprise us, so the whole lookup is guarded. Every
 * failure mode is described on the way out — there is no second, silent path.
 */
function lookupNativeModule(): NativeLookup {
  try {
    const { requireOptionalNativeModule } = require('expo') as typeof import('expo');
    const native = requireOptionalNativeModule<StretchRuntimeNativeModule>(MODULE_NAME);
    if (!native) {
      return { module: null, reason: 'module absent' };
    }
    if (
      typeof native.nowElapsedMs !== 'function' ||
      typeof native.getBootCount !== 'function'
    ) {
      return { module: null, reason: 'module shape invalid' };
    }
    return { module: native };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { module: null, reason: `lookup threw: ${detail}` };
  }
}

// Module-level memo: resolved once, then constant for the whole process.
let resolved = false;
let cachedModule: StretchRuntimeNativeModule | null = null;
let fallbackWarned = false;

/**
 * Runs the guarded lookup at most once per process. The resolved value — the
 * module instance, or `null` — is reused for every later call, so the time
 * source and boot identity cannot change mid-process.
 */
function loadStretchRuntime(): StretchRuntimeNativeModule | null {
  if (resolved) {
    return cachedModule;
  }
  const { module, reason } = lookupNativeModule();
  cachedModule = module;
  resolved = true;
  if (!module) {
    warnFallbackOnce(reason);
  }
  return cachedModule;
}

/**
 * Emits the single degraded-run warning for this process. Guarded so a hot
 * path can never turn it into per-frame log spam.
 */
function warnFallbackOnce(reason: string): void {
  if (fallbackWarned) {
    return;
  }
  fallbackWarned = true;
  console.warn(
    `${LOG_TAG} native module unusable (${reason}); falling back for this process: ` +
      'time source degrades to performance.now() (wall-clock independent, but deep sleep is not ' +
      'credited) and boot identity degrades to a per-process id (session recovery no longer ' +
      'survives a process restart).',
  );
}

/**
 * Test-only: forget the cached lookup so a fresh process can be simulated.
 * Production code never calls this — the cache is permanent on purpose.
 */
export function __resetStretchRuntimeLookupForTest(): void {
  resolved = false;
  cachedModule = null;
  fallbackWarned = false;
}

/** Monotonic ms since boot from the platform clock, or `null` if unavailable. */
export function nativeNowElapsedMs(): number | null {
  const native = loadStretchRuntime();
  if (!native) {
    return null;
  }
  const value = native.nowElapsedMs();
  return Number.isFinite(value) ? value : null;
}

/** Device boot counter, or `null` if the platform did not supply one. */
export function nativeBootCount(): number | null {
  const native = loadStretchRuntime();
  if (!native) {
    return null;
  }
  const value = native.getBootCount();
  return Number.isInteger(value) && value >= 0 ? value : null;
}
