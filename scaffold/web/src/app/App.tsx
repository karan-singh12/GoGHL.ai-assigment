import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { onUnauthorized } from '../lib/http';
import { qk } from '../lib/queryKeys';
import { ToastProvider } from '../shared/toast/ToastProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { createQueryClient } from './queryClient';
import { router } from './router';

export function App() {
  const [queryClient] = useState(createQueryClient);

  // Any 401 from any request means the session is gone: drop `me`, and RequireAuth redirects to /login.
  useEffect(
    () =>
      onUnauthorized(() => {
        if (queryClient.getQueryData(qk.me)) queryClient.setQueryData(qk.me, null);
      }),
    [queryClient],
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
