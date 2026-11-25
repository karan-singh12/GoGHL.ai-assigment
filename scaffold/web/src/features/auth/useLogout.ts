import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { session } from '../../lib/storage';
import { qk } from '../../lib/queryKeys';
import { authApi } from './api';

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      // Whatever the server said, forget everything about this user locally.
      qc.clear();
      qc.setQueryData(qk.me, null);
      session.removeByPrefix('sb:');
      navigate('/login', { replace: true });
    },
  });
}
