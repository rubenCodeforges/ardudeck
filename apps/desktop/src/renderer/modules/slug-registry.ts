import { useSyncExternalStore } from 'react';

export interface SlugEntry<T> {
  slug: string;
  id: string;
  value: T;
}

export function createSlugRegistry<T>() {
  const entries = new Map<string, SlugEntry<T>>();
  const listeners = new Set<() => void>();
  // Stable reference until a mutation: useSyncExternalStore compares with Object.is.
  let snapshot: SlugEntry<T>[] = [];

  const changed = () => {
    snapshot = Array.from(entries.values());
    for (const l of listeners) l();
  };

  const list = (): SlugEntry<T>[] => snapshot;
  const subscribe = (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  return {
    list,
    subscribe,
    register(slug: string, id: string, value: T): void {
      entries.set(`${slug}\u0000${id}`, { slug, id, value });
      changed();
    },
    unregister(slug: string, id: string): void {
      if (entries.delete(`${slug}\u0000${id}`)) changed();
    },
    unregisterAll(slug: string): void {
      let removed = false;
      for (const [key, e] of entries) if (e.slug === slug && entries.delete(key)) removed = true;
      if (removed) changed();
    },
    useEntries(): SlugEntry<T>[] {
      return useSyncExternalStore(subscribe, list);
    },
  };
}
