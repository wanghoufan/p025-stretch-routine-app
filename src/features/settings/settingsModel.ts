import {
  clampDuration,
  clampTransition,
  DEFAULT_STEP_DURATION_SEC,
  DEFAULT_TRANSITION_SEC,
} from '../../domain/routine/constants';
import {
  DEFAULT_AMBIENT_SOUND,
  normalizeAmbientSound,
  type AmbientSoundOption,
} from './ambientSound';
import type { Language } from '../../shared/i18n';

export const APP_LANGUAGE_STORAGE_KEY = 'app_language';
const LANGUAGE_VALUES: Language[] = ['zh', 'en'];

function normalizeLanguage(value: unknown): Language | undefined {
  return typeof value === 'string' && (LANGUAGE_VALUES as string[]).includes(value)
    ? (value as Language)
    : undefined;
}

/**
 * Minimal V1 settings (SPEC US7).
 *
 * Cosmetic personalisation is explicitly out of scope; only values that change
 * speech or timing defaults are configurable.
 */
export interface AppSettings {
  /** Speak cues at all. When off, the runner stays purely visual (FR-031). */
  ttsEnabled: boolean;
  /** Device speech rate multiplier. */
  speechRate: number;
  /** Optional "5 秒后开始下一个" warning cue. */
  countdownWarningEnabled: boolean;
  countdownWarningSec: number;
  /** Default duration applied to newly added steps. */
  defaultDurationSec: number;
  /** Default transition applied to new routines/steps. */
  defaultTransitionSec: number;
  /** Global countdown background loop (TASK-011); `silent` plays nothing. */
  ambientSound: AmbientSoundOption;
  /** Interface language; undefined falls back to the default (zh). */
  app_language?: Language;
}

export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2;
export const SPEECH_RATE_STEP = 0.1;
export const COUNTDOWN_WARNING_MIN_SEC = 3;
export const COUNTDOWN_WARNING_MAX_SEC = 15;

export const DEFAULT_SETTINGS: AppSettings = {
  ttsEnabled: true,
  speechRate: 1,
  countdownWarningEnabled: true,
  countdownWarningSec: 5,
  defaultDurationSec: DEFAULT_STEP_DURATION_SEC,
  defaultTransitionSec: DEFAULT_TRANSITION_SEC,
  ambientSound: DEFAULT_AMBIENT_SOUND,
};

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/** Coerce any stored/partial value into a fully valid settings object. */
export function normalizeSettings(input: Partial<AppSettings> = {}): AppSettings {
  return {
    ttsEnabled: input.ttsEnabled ?? DEFAULT_SETTINGS.ttsEnabled,
    speechRate:
      Math.round(clampNumber(input.speechRate ?? NaN, SPEECH_RATE_MIN, SPEECH_RATE_MAX, DEFAULT_SETTINGS.speechRate) * 10) / 10,
    countdownWarningEnabled: input.countdownWarningEnabled ?? DEFAULT_SETTINGS.countdownWarningEnabled,
    countdownWarningSec: Math.round(
      clampNumber(
        input.countdownWarningSec ?? NaN,
        COUNTDOWN_WARNING_MIN_SEC,
        COUNTDOWN_WARNING_MAX_SEC,
        DEFAULT_SETTINGS.countdownWarningSec,
      ),
    ),
    defaultDurationSec: clampDuration(input.defaultDurationSec ?? DEFAULT_SETTINGS.defaultDurationSec),
    defaultTransitionSec: clampTransition(input.defaultTransitionSec ?? DEFAULT_SETTINGS.defaultTransitionSec),
    ambientSound: normalizeAmbientSound(input.ambientSound),
    app_language: normalizeLanguage(input.app_language),
  };
}

/** Flat string record, matching the `app_settings` key/value table. */
export function settingsToRecord(settings: AppSettings): Record<string, string> {
  return {
    ttsEnabled: String(settings.ttsEnabled),
    speechRate: String(settings.speechRate),
    countdownWarningEnabled: String(settings.countdownWarningEnabled),
    countdownWarningSec: String(settings.countdownWarningSec),
    defaultDurationSec: String(settings.defaultDurationSec),
    defaultTransitionSec: String(settings.defaultTransitionSec),
    ambientSound: settings.ambientSound,
    ...(settings.app_language ? { [APP_LANGUAGE_STORAGE_KEY]: settings.app_language } : {}),
  };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  // Anything else is treated as missing so the default applies.
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function settingsFromRecord(record: Record<string, string>): AppSettings {
  const partial: Partial<AppSettings> = {};
  const ttsEnabled = parseBoolean(record.ttsEnabled);
  if (ttsEnabled !== undefined) {
    partial.ttsEnabled = ttsEnabled;
  }
  const countdownWarningEnabled = parseBoolean(record.countdownWarningEnabled);
  if (countdownWarningEnabled !== undefined) {
    partial.countdownWarningEnabled = countdownWarningEnabled;
  }
  const speechRate = parseNumber(record.speechRate);
  if (speechRate !== undefined) {
    partial.speechRate = speechRate;
  }
  const countdownWarningSec = parseNumber(record.countdownWarningSec);
  if (countdownWarningSec !== undefined) {
    partial.countdownWarningSec = countdownWarningSec;
  }
  const defaultDurationSec = parseNumber(record.defaultDurationSec);
  if (defaultDurationSec !== undefined) {
    partial.defaultDurationSec = defaultDurationSec;
  }
  const defaultTransitionSec = parseNumber(record.defaultTransitionSec);
  if (defaultTransitionSec !== undefined) {
    partial.defaultTransitionSec = defaultTransitionSec;
  }
  // `normalizeAmbientSound` already falls back for unknown / missing values.
  partial.ambientSound = normalizeAmbientSound(record.ambientSound);
  partial.app_language = normalizeLanguage(record[APP_LANGUAGE_STORAGE_KEY]);
  return normalizeSettings(partial);
}
