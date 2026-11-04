import type { Handlers } from '../main/ipc-handlers';

/** Every IPC channel. `satisfies`+check below make the compiler fail if a handler is added and not exposed. */
export const API_METHODS = [
  'hubInfo', 'listBlocks', 'saveBlock', 'deleteBlock', 'listCheckpoints', 'generateCheckpoints',
  'listWorkOrders', 'createWorkOrder', 'setWorkOrderStatus', 'listSessions', 'listSamples',
  'listLogs', 'addLog', 'phiStatus', 'costSummary', 'planFertigation', 'issueLease', 'abortLease', 'listLeases',
  'chooseTiles', 'hasTiles',
] as const;

type Shell = { chooseTiles(): Promise<boolean>; hasTiles(): Promise<boolean> };
type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never };
export type DesktopApi = Async<Omit<Handlers, 'mediaUrl'>> & Shell;

type Missing = Exclude<keyof DesktopApi, (typeof API_METHODS)[number]>;
export const _allMethodsExposed: [Missing] extends [never] ? true : never = true;
