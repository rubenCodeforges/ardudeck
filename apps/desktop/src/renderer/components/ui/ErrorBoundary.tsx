import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Short label for what failed, shown in the fallback (e.g. "waypoint list"). */
  label?: string;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  /** First frame of the React component stack, so the fallback names the culprit. */
  crashSite: string | null;
}

/**
 * Catches render/lifecycle errors in its subtree and shows an inline fallback
 * instead of letting the whole window go blank. Without this, an uncaught throw
 * (e.g. a render loop in one panel) unmounts the entire React tree - a black
 * screen for the user with no way to recover but a restart.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, crashSite: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack);
    const site = info.componentStack?.split('\n').map(s => s.trim()).filter(Boolean)[0] ?? null;
    this.setState({ crashSite: site });
  }

  reset = () => this.setState({ error: null, crashSite: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-surface">
        <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="text-sm font-medium text-content">
          {this.props.label ? `The ${this.props.label} hit an error` : 'Something went wrong'}
        </div>
        <div className="text-[11px] text-content-tertiary font-mono max-w-[28rem] break-words">
          {error.message}
          {this.state.crashSite && <div className="mt-1 opacity-70">{this.state.crashSite}</div>}
        </div>
        <button
          onClick={this.reset}
          className="mt-1 px-3 py-1.5 text-xs rounded-md bg-surface-raised text-content hover:text-blue-300 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
