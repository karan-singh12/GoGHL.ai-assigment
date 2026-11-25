import { createBrowserRouter, Link, useParams, useRouteError } from 'react-router';
import { LoginPage, RequireAuth } from '../features/auth';
import { ConversationPane, NoConversationSelected } from '../features/conversation/ConversationPane';
import { RootRedirect } from '../features/workspace/RootRedirect';
import { WorkspaceLayout } from '../features/workspace/WorkspaceLayout';
import { EmptyState } from '../shared/ui/EmptyState';

/** Remount per contact so drafts, scroll position and mutations never leak between conversations. */
function ConversationRoute() {
  const { contact } = useParams();
  return <ConversationPane key={contact} />;
}

function RouteError() {
  const err = useRouteError() as { statusText?: string; message?: string } | undefined;
  return (
    <div className="center-fill">
      <EmptyState title={err?.statusText ?? err?.message ?? 'Something went wrong.'}>
        <Link to="/">Back to inbox</Link>
      </EmptyState>
    </div>
  );
}

function NotFound() {
  return (
    <div className="center-fill">
      <EmptyState title="Page not found.">
        <Link to="/">Back to inbox</Link>
      </EmptyState>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        path: 'w/:workspaceId',
        element: <WorkspaceLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <NoConversationSelected /> },
          { path: 'c/:contact', element: <ConversationRoute />, errorElement: <RouteError /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
