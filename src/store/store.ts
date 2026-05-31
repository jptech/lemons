/**
 * A tiny reactive store — the single membrane between the pure engine state and
 * the UI. No dependencies. `setState` swaps in a new immutable state object and
 * notifies subscribers once per microtask (so a burst of synchronous updates
 * triggers a single re-render).
 */
export interface Store<T> {
  /** Current state. Treat as read-only — never mutate in place. */
  getState(): Readonly<T>;
  /** Replace state via a pure updater, then schedule a batched notify. */
  setState(updater: (state: Readonly<T>) => T): void;
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: (state: Readonly<T>) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state: T = initial;
  const listeners = new Set<(state: Readonly<T>) => void>();
  let scheduled = false;

  function flush() {
    scheduled = false;
    // Snapshot so a listener that (un)subscribes mid-flush is well-defined.
    for (const listener of [...listeners]) listener(state);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  return {
    getState() {
      return state;
    },
    setState(updater) {
      const next = updater(state);
      if (next === state) return; // no-op updaters skip the notify
      state = next;
      schedule();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
