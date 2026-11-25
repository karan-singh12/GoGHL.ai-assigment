// sessionStorage can be missing or throw (private mode, blocked storage).
// Everything here is a convenience; the app works without it.

export const session = {
  get(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  removeByPrefix(prefix: string): void {
    try {
      const s = window.sessionStorage;
      for (let i = s.length - 1; i >= 0; i--) {
        const k = s.key(i);
        if (k?.startsWith(prefix)) s.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  },
};
