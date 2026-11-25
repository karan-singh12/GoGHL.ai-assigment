import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/http';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Realtime keeps data fresh; refetch on focus is a safety net, not the main path.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => count < 3 && (!(err instanceof ApiError) || err.retryable),
        retryDelay: (attempt) => Math.min(8_000, 500 * 2 ** attempt),
      },
      mutations: { retry: false },
    },
  });
}
