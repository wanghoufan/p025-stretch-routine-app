import { requireOptionalNativeModule } from 'expo';
import { DeviceMonotonicClock, FakeMonotonicClock } from '../../services/clock';
import { DeviceBootInfoProvider } from '../../services/runtime/BootInfo';
import { __resetStretchRuntimeLookupForTest } from '../../services/runtime/StretchRuntime';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const requireOptionalNativeModuleMock = requireOptionalNativeModule as unknown as jest.Mock;

/**
 * R006: the production clock and boot identity must come from the device, and
 * must not be derivable from — or perturbable by — the wall clock.
 *
 * These tests pin the *source selection* contract. They are deliberately not
 * offered as device evidence: the real proof that `elapsedRealtime` /
 * `BOOT_COUNT` reach the app is the on-device run recorded in the handoff.
 */
function setNativeModule(module: unknown): void {
  requireOptionalNativeModuleMock.mockReturnValue(module);
}

describe('DeviceMonotonicClock', () => {
  beforeEach(() => {
    setNativeModule(null);
  });

  it('reads the device monotonic clock when the native module is present', () => {
    const values = [12_345.5, 12_345.5, 13_000.25];
    let index = 0;
    setNativeModule({
      nowElapsedMs: () => values[Math.min(index++, values.length - 1)],
      getBootCount: () => 157,
    });

    const clock = new DeviceMonotonicClock();
    expect(clock.nowElapsedMs()).toBe(12_345.5);
    expect(clock.nowElapsedMs()).toBe(12_345.5);
    expect(clock.nowElapsedMs()).toBe(13_000.25);
  });

  it('never reads the wall clock, native module present', () => {
    setNativeModule({ nowElapsedMs: () => 500_000, getBootCount: () => 3 });
    const dateNowSpy = jest.spyOn(Date, 'now');

    expect(new DeviceMonotonicClock().nowElapsedMs()).toBe(500_000);
    expect(dateNowSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
  });

  it('falls back to the React Native high-resolution clock without the module', () => {
    const performanceNowSpy = jest.spyOn(globalThis.performance, 'now').mockReturnValue(987_654.25);

    expect(new DeviceMonotonicClock().nowElapsedMs()).toBe(987_654.25);

    performanceNowSpy.mockRestore();
  });

  it('is unaffected by a wall-clock jump on the fallback path either', () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const performanceNowSpy = jest.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    const clock = new DeviceMonotonicClock();

    const before = clock.nowElapsedMs();
    // +1h wall-clock jump: the monotonic source does not move.
    dateNowSpy.mockReturnValue(1_700_000_000_000 + 3_600_000);
    const after = clock.nowElapsedMs();

    expect(before).toBe(1000);
    expect(after).toBe(1000);

    dateNowSpy.mockRestore();
    performanceNowSpy.mockRestore();
  });
});

describe('DeviceBootInfoProvider', () => {
  it('reports the platform boot counter when available', () => {
    setNativeModule({ nowElapsedMs: () => 1, getBootCount: () => 157 });

    const provider = new DeviceBootInfoProvider();
    // Same boot, repeated reads (process restarts included) -> identical value.
    expect(provider.getBootCount()).toBe(157);
    expect(provider.getBootCount()).toBe(157);
  });

  it('changes identity when the platform boot counter changes (real reboot)', () => {
    setNativeModule({ nowElapsedMs: () => 1, getBootCount: () => 157 });
    expect(new DeviceBootInfoProvider().getBootCount()).toBe(157);

    // The native lookup is memoised for the lifetime of a process (R006 P1-1),
    // so a changed BOOT_COUNT is only observed across a *new process* — which
    // is what a real reboot is. Clear the cache to cross that boundary.
    __resetStretchRuntimeLookupForTest();
    setNativeModule({ nowElapsedMs: () => 1, getBootCount: () => 158 });
    expect(new DeviceBootInfoProvider().getBootCount()).toBe(158);
  });

  it('treats the unavailable sentinel (-1) as no identity', () => {
    setNativeModule({ nowElapsedMs: () => 1, getBootCount: () => -1 });

    const provider = new DeviceBootInfoProvider();
    // Falls back to a per-process identity that is not derived from the clock.
    const dateNowSpy = jest.spyOn(Date, 'now');
    expect(provider.getBootCount()).toBeGreaterThan(0);
    expect(dateNowSpy).not.toHaveBeenCalled();
    dateNowSpy.mockRestore();
  });

  it('falls back to a per-process identity that is stable in-process', () => {
    setNativeModule(null);

    const provider = new DeviceBootInfoProvider();
    const first = provider.getBootCount();
    expect(provider.getBootCount()).toBe(first);
  });

  it('does not reuse one process identity for two processes', () => {
    setNativeModule(null);

    // Different processes must not agree on a boot identity: the fail-safe is
    // "treat a restart as a new boot" when the platform cannot tell us better.
    const identities = new Set<number>();
    for (let i = 0; i < 50; i += 1) {
      identities.add(new DeviceBootInfoProvider().getBootCount());
    }
    expect(identities.size).toBeGreaterThan(1);
  });
});

describe('FakeMonotonicClock still behaves as the test double', () => {
  it('only moves when the test moves it', () => {
    const clock = new FakeMonotonicClock(0);
    clock.advance(1000);
    expect(clock.nowElapsedMs()).toBe(1000);
    expect(() => clock.advance(-1)).toThrow();
  });
});
