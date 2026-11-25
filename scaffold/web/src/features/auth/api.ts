import { ApiError, http } from '../../lib/http';
import type { Me } from '../../domain/types';

export const authApi = {
  /** Contract route (raw shape). A 401 means "not signed in", which is a normal state, not an error. */
  async me(): Promise<Me | null> {
    try {
      return await http.raw<Me>('/api/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  logout: () => http.raw<unknown>('/auth/logout', { method: 'POST', body: {} }),

  /** Full-page navigation: the server builds the PKCE request and redirects to the IdP. */
  loginUrl: (returnTo?: string) => (returnTo ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}` : '/auth/login'),
};
