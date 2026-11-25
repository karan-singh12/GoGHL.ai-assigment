import { Navigate, useLocation } from 'react-router';
import { UI } from '../../constants/uiMessages';
import { FullPageSpinner } from '../../shared/ui/Spinner';
import { authApi } from './api';
import { useMe } from './useMe';

export function LoginPage() {
  const me = useMe();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to={from ?? '/'} replace />;

  return (
    <main className="login">
      <div className="login__card">
        <div className="brand brand--lg" aria-hidden="true">
          ☎
        </div>
        <h1 className="login__title">{UI.appName}</h1>
        <p className="login__subtitle">{UI.signInTitle}</p>
        {/* A plain link: the browser must navigate so the server can redirect to the IdP. */}
        <a className="btn btn--primary btn--md login__button" href={authApi.loginUrl(from)}>
          {UI.signInButton}
        </a>
      </div>
    </main>
  );
}
