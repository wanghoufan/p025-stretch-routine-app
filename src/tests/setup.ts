/**
 * Global Jest setup for the Stretch Routine V1 test suite.
 *
 * Keeps the environment deterministic and quiet: React/RN noise from
 * `act()`-adjacent warnings would otherwise drown out real failures.
 */

import { __resetStretchRuntimeLookupForTest } from '../services/runtime/StretchRuntime';

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

/**
 * The `stretch-runtime` bridge memoises its native lookup for the lifetime of a
 * process (R006 P1-1). Tests that simulate different native availability must
 * therefore each start from a fresh "process", otherwise the cached first
 * lookup leaks between cases. Reset here so no individual test needs to know
 * about the cache.
 */
beforeEach(() => {
  __resetStretchRuntimeLookupForTest();
});

const IGNORED_PATTERNS = [
  'not wrapped in act',
  'componentWillReceiveProps',
  'An update to',
  'AsyncStorage has been extracted',
];

function shouldIgnore(message: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => message.includes(pattern));
}

beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (shouldIgnore(first)) {
      return;
    }
    originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (shouldIgnore(first)) {
      return;
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});
