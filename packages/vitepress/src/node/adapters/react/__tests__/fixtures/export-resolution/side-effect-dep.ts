// Side-effect module (e.g., polyfill, CSS, global registration)
(globalThis as Record<string, unknown>).__sideEffectExecuted = true;
