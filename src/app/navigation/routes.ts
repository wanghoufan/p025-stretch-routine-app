/**
 * Route table for the small in-app stack.
 *
 * V1 has seven screens and no deep linking, so a typed `useState` stack is
 * enough — no navigation framework is introduced (Constitution §3.1).
 *
 * `Runner` deliberately takes no params (R019): it is driven entirely by the
 * stored ActiveSession, so it can continue even after the source Routine was
 * renamed or deleted.
 */

import type { CompletionOutcome } from '../../domain/statistics/history';

export interface RouteParamsMap {
  Home: undefined;
  RoutineDetail: { routineId: string };
  RoutineEditor: { routineId?: string };
  Runner: undefined;
  Completion: {
    routineId: string;
    routineName: string;
    stepCount: number;
    /**
     * TASK-021-B4 (HD-6): actual action time of the session — the same
     * ledger/rounding the statistics screen shows (pauses/transitions excluded).
     */
    actionMs: number;
    /** Terminal-archive outcome the completion screen explains (retry on failure). */
    outcome: CompletionOutcome;
  };
  ActionLibrary: undefined;
  Settings: undefined;
  /** TASK-021-B2: standalone history & stats screen (no 4th tab, HD-4). */
  Stats: undefined;
}

export type RouteName = keyof RouteParamsMap;

export type Route = {
  [K in RouteName]: { name: K; params: RouteParamsMap[K] };
}[RouteName];

export const HOME_ROUTE: Route = { name: 'Home', params: undefined };

/** Screen headers use one Chinese title per route. */
export const ROUTE_TITLES: Record<RouteName, string> = {
  Home: '我的流程',
  RoutineDetail: '流程详情',
  RoutineEditor: '编辑流程',
  Runner: '进行中',
  Completion: '完成',
  ActionLibrary: '动作库',
  Settings: '设置',
  Stats: '历史统计',
};
