import { useSyncExternalStore } from 'react';

/**
 * Minimal observable store built on useSyncExternalStore — no external
 * dependency, enough for this app's state slices.
 *
 * Selectors passed to useStoreSelector MUST return a stable value (a primitive
 * or an object that already lives in the state), otherwise React will warn
 * about uncached snapshots.
 */

type Listener = () => void;

export interface Store<T extends object> {
  get: () => T;
  set: (next: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();

  const get = (): T => state;

  const set: Store<T>['set'] = (next) => {
    const patch = typeof next === 'function' ? next(state) : next;
    const merged = { ...state, ...patch } as T;
    const changed = (Object.keys(merged) as Array<keyof T>).some(
      (key) => !Object.is(merged[key], state[key])
    );
    if (!changed) return;
    state = merged;
    listeners.forEach((listener) => listener());
  };

  const subscribe: Store<T>['subscribe'] = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { get, set, subscribe };
}

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useStoreSelector<T extends object, U>(
  store: Store<T>,
  selector: (state: T) => U
): U {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get())
  );
}
