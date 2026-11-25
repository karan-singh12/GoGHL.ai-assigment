import { useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { messageFor, UI } from '../../constants/uiMessages';
import { Spinner, FullPageSpinner } from '../../shared/ui/Spinner';
import { authApi } from './api';
import { useMe } from './useMe';

export function LoginPage() {
  const me = useMe();
  const location = useLocation();
  const [params] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;
  const error = params.get('error'); // set by /auth/callback on failure

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
        {error && !redirecting && (
          <p className="login__error" role="alert">
            {messageFor({ code: error })}
          </p>
        )}
        {/*
          A real navigation, not fetch(): the server answers with a 302 to the IdP
          and the IdP shows its own page. PKCE runs entirely on the server.
        */}
        <a
          className="btn btn--primary btn--md login__button"
          href={authApi.loginUrl(from)}
          aria-disabled={redirecting || undefined}
          onClick={(e) => {
            if (redirecting) e.preventDefault();
            else setRedirecting(true);
          }}
        >
          {redirecting && <Spinner size={14} />}
          {redirecting ? UI.redirecting : UI.signInButton}
        </a>
        <p className="login__note">{UI.accountsNote}</p>
      </div>
    </main>
  );
}
