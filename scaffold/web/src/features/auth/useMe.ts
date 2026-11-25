import { useQuery } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { authApi } from './api';

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
    retry: (count, err) => count < 2 && (err as { retryable?: boolean }).retryable !== false,
  });
}
