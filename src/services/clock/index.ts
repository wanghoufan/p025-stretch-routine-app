/**
 * Clock ports (R007).
 *
 * Two distinct abstractions, never interchangeable:
 *  - `WallClock`      -> real-world timestamps (createdAt / updatedAt, display).
 *  - `MonotonicClock` -> authoritative elapsed time for the runner.
 */
export type { WallClock } from './WallClock';
export { SystemWallClock, FakeClock } from './WallClock';
export type { MonotonicClock } from './MonotonicClock';
export { DeviceMonotonicClock, FakeMonotonicClock } from './MonotonicClock';
