// Vitest setup — runs before each test file
// Canvas mock for Phaser (not needed for unit tests, but prevents errors if Phaser is imported)

// localStorage shim. Node 25+ ships an experimental `localStorage` global
// that lacks the full Web Storage API (no `.clear()`), and Vitest's jsdom
// environment does not override it because the Node global wins. We install
// an in-memory Storage implementation on both `globalThis` and `window` so
// tests relying on localStorage (e.g. Zustand persist middleware) work
// consistently regardless of the Node version.
(() => {
  const store = new Map<string, string>();
  const api: Storage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: api,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: api,
    });
  }
})();
