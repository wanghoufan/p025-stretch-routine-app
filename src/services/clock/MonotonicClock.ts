import { nativeNowElapsedMs } from '../runtime/StretchRuntime';

/**
 * Monotonic clock port (PRODUCT_PLAN_V1.2 Technical Approach — Clock; R007).
 *
 * `nowElapsedMs()` is milliseconds since an arbitrary origin that must **not**
 * be affected by wall-clock changes. It is the single source of truth for every
 * authoritative runner duration: countdowns, catch-up, pause/resume and
 * same-boot recovery.
 *
 * ── Source (R006) ──────────────────────────────────────────────────────────
 * The production source is the local `stretch-runtime` Android module, which
 * returns `SystemClock.elapsedRealtime()`:
 *   - driven by the kernel `CLOCK_BOOTTIME` clock, so it keeps counting through
 *     Doze/deep sleep;
 *   - completely independent of the RTC, so a user or network wall-clock change
 *     (and the ±1h/±1d jumps in the device tests) cannot move it.
 *
 * Where that module is absent — Expo Go, Jest, web — the clock falls back to
 * React Native's own high-resolution clock (`performance.now()`), which is
 * `std::chrono::steady_clock` in the C++ layer (see
 * `ReactCommon/react/timing/primitives.h`), i.e. `CLOCK_MONOTONIC` on Android:
 * still wall-clock independent, just without deep-sleep credit.
 * `Date.now()` is never used here on any path.
 */
export interface MonotonicClock {
  nowElapsedMs(): number;
}

/** Runtime globals that may carry a high-resolution monotonic clock. */
interface MonotonicGlobals {
  performance?: { now?: () => number };
  nativePerformanceNow?: () => number;
}

/**
 * React Native's built-in high-resolution clock (ms since boot, monotonic).
 * `setUpPerformance` installs one of these two on every RN runtime.
 */
function highResolutionElapsedMs(): number {
  const scope = globalThis as unknown as MonotonicGlobals;
  if (typeof scope.performance?.now === 'function') {
    return scope.performance.now();
  }
  if (typeof scope.nativePerformanceNow === 'function') {
    return scope.nativePerformanceNow();
  }
  throw new Error('no monotonic time source available in this runtime');
}

/**
 * Production monotonic clock: device `elapsedRealtime` through the native
 * module, with the React Native high-resolution clock as the dev-runtime
 * fallback. Both are monotonic; only the native one credits deep sleep.
 */
export class DeviceMonotonicClock implements MonotonicClock {
  nowElapsedMs(): number {
    return nativeNowElapsedMs() ?? highResolutionElapsedMs();
  }
}

/**
 * Test monotonic clock. Independent of any wall clock: `advanceWallClock` never
 * touches it, which is exactly how the ±1h/±1d wall-jump tests prove the runner
 * timing is unaffected.
 */
export class FakeMonotonicClock implements MonotonicClock {
  private current: number;

  constructor(startMs = 0) {
    this.current = startMs;
  }

  nowElapsedMs(): number {
    return this.current;
  }

  /** Move monotonic time forward (the only thing that may move it). */
  advance(ms: number): void {
    if (ms < 0) {
      throw new Error('FakeMonotonicClock cannot move backwards');
    }
    this.current += ms;
  }

  set(ms: number): void {
    this.current = ms;
  }
}
