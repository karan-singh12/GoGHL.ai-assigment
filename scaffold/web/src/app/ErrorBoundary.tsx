import { Component, type ErrorInfo, type ReactNode } from 'react';
import { EmptyState } from '../shared/ui/EmptyState';

interface State {
  error: Error | null;
}

/** Last line of defence: a render bug shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-fill">
        <EmptyState title="Something went wrong on this screen.">
          <button type="button" className="btn btn--primary btn--md" onClick={() => window.location.reload()}>
            Reload
          </button>
        </EmptyState>
      </div>
    );
  }
}
