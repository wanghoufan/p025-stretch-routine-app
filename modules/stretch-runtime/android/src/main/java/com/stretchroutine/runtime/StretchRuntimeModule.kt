package com.stretchroutine.runtime

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Local Android native module (R006) — the two device facts the JS timing layer
 * cannot derive for itself, both of them independent of the wall clock.
 *
 * `nowElapsedMs` returns `SystemClock.elapsedRealtime()`: milliseconds since
 * boot, driven by the `CLOCK_BOOTTIME` kernel clock. It keeps counting through
 * Doze / deep sleep and does **not** move when the user or the network changes
 * the system time. `Date.now()` and `System.currentTimeMillis()` (both
 * `CLOCK_REALTIME`) are deliberately not used anywhere here — a wall-clock jump
 * is exactly what this module exists to be immune to.
 *
 * `getBootCount` returns `Settings.Global.BOOT_COUNT`, the system's own
 * per-boot counter. It is constant for the whole lifetime of one boot (so a
 * process restart within the same boot keeps the same identity) and increments
 * only on a real device reboot — which is what lets session recovery tell
 * "the process died" apart from "the device restarted".
 *
 * Both values come from the platform, so neither can be spoofed or perturbed by
 * a clock change.
 */
class StretchRuntimeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StretchRuntime")

    Function("nowElapsedMs") {
      // `Double` keeps the value exact in JS: elapsedRealtime is far below 2^53 ms.
      SystemClock.elapsedRealtime().toDouble()
    }

    Function("getBootCount") {
      readBootCount(appContext.reactContext)
    }
  }

  /**
   * `BOOT_COUNT_UNAVAILABLE` (-1) is the documented "no trustworthy identity"
   * answer; the JS provider turns it into its conservative fallback rather than
   * pretending every boot is the same one.
   */
  private fun readBootCount(context: Context?): Int {
    if (context == null) {
      return BOOT_COUNT_UNAVAILABLE
    }
    return try {
      Settings.Global.getInt(
        context.contentResolver,
        Settings.Global.BOOT_COUNT,
        BOOT_COUNT_UNAVAILABLE,
      )
    } catch (error: Exception) {
      // Some OEM builds restrict this global setting; stay conservative.
      BOOT_COUNT_UNAVAILABLE
    }
  }

  private companion object {
    const val BOOT_COUNT_UNAVAILABLE = -1
  }
}
