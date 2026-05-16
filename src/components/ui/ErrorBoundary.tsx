'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center p-8 text-center bg-gray-950 min-h-screen">
          <div className="max-w-lg w-full px-4">
            <p className="text-red-400 text-sm font-semibold mb-2">Something went wrong</p>
            <p className="text-gray-500 text-xs font-mono mb-4">{this.state.error.message}</p>
            {this.state.componentStack && (
              <pre className="text-left text-[10px] text-gray-600 font-mono bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 mb-4 overflow-x-auto max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-all">
                {this.state.componentStack}
              </pre>
            )}
            <button
              onClick={() => this.setState({ error: null, componentStack: null })}
              className="mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
