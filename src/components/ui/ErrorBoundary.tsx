'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center p-8 text-center">
          <div>
            <p className="text-red-400 text-sm font-semibold mb-2">Something went wrong</p>
            <p className="text-gray-500 text-xs font-mono">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-3 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
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
