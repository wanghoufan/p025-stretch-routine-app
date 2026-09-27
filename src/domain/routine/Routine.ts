/** Domain: Routine (SPEC §7, PLAN §4). */

import type { TagFields } from '../tags';

export interface Routine extends TagFields {
  id: string;
  name: string;
  defaultDurationSec: number;
  defaultTransitionSec: number;
  /**
   * Training type (TASK-021-B1, HD-1=B). `null`/undefined = 未分类; only the
   * editor (B3) writes it — the data layer never infers it.
   */
  trainingTypeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Routine plus derived figures used by Home / Detail lists. */
export interface RoutineSummary extends Routine {
  stepCount: number;
  totalDurationSec: number;
}
