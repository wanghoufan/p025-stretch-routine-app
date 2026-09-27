import { nativeBootCount } from './StretchRuntime';

/**
 * Boot / process identity port (R012, R032).
 *
 * Recovery must be able to tell "the same process is still alive" apart from
 * "the process restarted". Only in the first case may a stored active session
 * be continued automatically.
 *
 * ── Source (R006) ──────────────────────────────────────────────────────────
 * The production source is the local `stretch-runtime` Android module, which
 * returns `Settings.Global.BOOT_COUNT` — the system's own per-boot counter:
 *   - constant for the entire lifetime of one boot, so a process killed by the
 *     OS / a crash / memory pressure and restarted still sees the same value and
 *     the session can be continued;
 *   - incremented only by a real device reboot, so a session whose monotonic
 *     origin belongs to a previous boot is rejected;
 *   - unrelated to the wall clock, so changing the system time does not look
 *     like a reboot.
 *
 * Where that module is absent (Expo Go, Jest, web) the provider falls back to a
 * per-process identity. That is the conservative direction — a restart is then
 * indistinguishable from a reboot and the session is discarded without
 * playback — and it is deliberately **not** wall-clock derived, so it can never
 * make a clock change look like a stable identity.
 */
export interface BootInfoProvider {
  getBootCount(): number;
}

/**
 * Process-unique identity for runtimes without the native module. Random rather
 * than time derived: a clock change must not be able to hold this value stable
 * across two processes, and two processes must not accidentally agree it is the
 * same boot.
 */
function createProcessIdentity(): number {
  return Math.floor(Math.random() * 0x7ffffffe) + 1;
}

/**
 * Production boot identity: the platform boot counter, falling back to the
 * per-process identity when the native module cannot supply one.
 */
export class DeviceBootInfoProvider implements BootInfoProvider {
  private readonly processIdentity = createProcessIdentity();

  getBootCount(): number {
    return nativeBootCount() ?? this.processIdentity;
  }
}

/** Test provider: boot identity is explicit and never accidental. */
export class FakeBootInfoProvider implements BootInfoProvider {
  constructor(private bootCount = 1) {}

  getBootCount(): number {
    return this.bootCount;
  }

  /** Simulate a device/process restart. */
  setBootCount(bootCount: number): void {
    this.bootCount = bootCount;
  }
}
