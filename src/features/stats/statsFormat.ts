import type { Language } from '../../shared/i18n';

/**
 * Bilingual duration formatting for the history stats screen (TASK-021-B2).
 *
 * Counts are actual action time (milliseconds, monotonic-derived). Kept apart
 * from the legacy Chinese-only `formatDuration` so existing screens are not
 * affected; this one resolves units through the i18n dictionary, so a language
 * switch re-renders instantly.
 */

const UNITS: Record<Language, { h: string; m: string; s: string }> = {
  zh: { h: '小时', m: '分', s: '秒' },
  en: { h: 'h ', m: 'm ', s: 's' },
};

/** `110_000` -> `1分50秒` / `1m 50s`; `45_000` -> `45秒` / `45s`. */
export function formatStatsDuration(milliseconds: number, language: Language): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const units = UNITS[language] ?? UNITS.zh;

  if (hours > 0) {
    return minutes > 0 ? `${hours}${units.h}${minutes}${units.m}` : `${hours}${units.h}`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}${units.m}${seconds}${units.s}` : `${minutes}${units.m}`;
  }
  return `${seconds}${units.s}`;
}
