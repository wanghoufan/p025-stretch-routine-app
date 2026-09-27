import { requireOptionalNativeModule } from 'expo';
import {
  __resetStretchRuntimeLookupForTest,
  nativeBootCount,
  nativeNowElapsedMs,
} from '../../services/runtime/StretchRuntime';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const requireOptionalNativeModuleMock = requireOptionalNativeModule as unknown as jest.Mock;

/**
 * R006 P1-1: the native-module lookup must be resolved exactly once per process
 * (so the time source can never switch epochs mid-process), and a degraded run
 * must announce itself exactly once instead of silently returning `null`.
 *
 * These tests pin that *lookup / observability* contract. They are not device
 * evidence — the on-device proof lives in the QA run, as for the sibling
 * `nativeTimeSource.test.ts`. The process cache is cleared before each case by
 * the global setup (`src/tests/setup.ts`).
 */
function setNativeModule(module: unknown): void {
  requireOptionalNativeModuleMock.mockReturnValue(module);
}

describe('StretchRuntime lookup is memoised per process', () => {
  beforeEach(() => {
    requireOptionalNativeModuleMock.mockReset();
  });

  it('looks the module up only once and reuses it for every accessor', () => {
    setNativeModule({ nowElapsedMs: () => 12_345.5, getBootCount: () => 157 });

    expect(nativeNowElapsedMs()).toBe(12_345.5);
    expect(nativeNowElapsedMs()).toBe(12_345.5);
    expect(nativeBootCount()).toBe(157);

    expect(requireOptionalNativeModuleMock).toHaveBeenCalledTimes(1);
  });

  it('caches a missing module too, so the fallback source cannot flip mid-process', () => {
    setNativeModule(null);
    expect(nativeNowElapsedMs()).toBeNull();
    expect(nativeNowElapsedMs()).toBeNull();
    expect(nativeBootCount()).toBeNull();
    expect(requireOptionalNativeModuleMock).toHaveBeenCalledTimes(1);

    // Even if the module would suddenly be available, this process must stay on
    // the epoch it picked first — flipping here is what could rewind the clock.
    setNativeModule({ nowElapsedMs: () => 999, getBootCount: () => 1 });
    expect(nativeNowElapsedMs()).toBeNull();
    expect(nativeBootCount()).toBeNull();
    expect(requireOptionalNativeModuleMock).toHaveBeenCalledTimes(1);
  });

  it('caches a malformed module (wrong shape) as unavailable', () => {
    setNativeModule({ nowElapsedMs: () => 1 }); // getBootCount missing

    expect(nativeNowElapsedMs()).toBeNull();
    expect(nativeBootCount()).toBeNull();
    expect(requireOptionalNativeModuleMock).toHaveBeenCalledTimes(1);
  });

  it('caches a throwing lookup as unavailable', () => {
    requireOptionalNativeModuleMock.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(nativeNowElapsedMs()).toBeNull();
    expect(nativeNowElapsedMs()).toBeNull();
    expect(requireOptionalNativeModuleMock).toHaveBeenCalledTimes(1);
  });
});

describe('StretchRuntime degraded-run warning', () => {
  beforeEach(() => {
    requireOptionalNativeModuleMock.mockReset();
  });

  it('warns exactly once across repeated accessor calls when the module is absent', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setNativeModule(null);

    nativeNowElapsedMs();
    nativeNowElapsedMs();
    nativeBootCount();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('[stretch-runtime]');
    expect(message).toContain('module absent');
    expect(message).toContain('performance.now');
    expect(message).toContain('deep sleep');

    warnSpy.mockRestore();
  });

  it('does not warn when the module is healthy', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setNativeModule({ nowElapsedMs: () => 1, getBootCount: () => 5 });

    nativeNowElapsedMs();
    nativeBootCount();

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('routes an invalid module shape through the same warning channel', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setNativeModule({ nowElapsedMs: () => 1 }); // getBootCount missing

    expect(nativeNowElapsedMs()).toBeNull();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('module shape invalid');

    warnSpy.mockRestore();
  });

  it('reports the exception itself when the lookup throws', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    requireOptionalNativeModuleMock.mockImplementation(() => {
      throw new Error('kaboom');
    });

    expect(nativeNowElapsedMs()).toBeNull();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('lookup threw: kaboom');

    warnSpy.mockRestore();
  });

  it('exposes a test-only reset that starts a fresh process', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setNativeModule(null);
    nativeNowElapsedMs();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    __resetStretchRuntimeLookupForTest();
    setNativeModule({ nowElapsedMs: () => 1, getBootCount: () => 5 });
    expect(nativeBootCount()).toBe(5);
    expect(requireOptionalNativeModuleMock).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });
});
