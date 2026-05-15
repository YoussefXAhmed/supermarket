import { Component } from 'react';
import { Btn } from '../ui';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary card">
          <span className="error-boundary__icon" aria-hidden>⚠</span>
          <h2 className="error-boundary__title">Something went wrong</h2>
          <p className="error-boundary__desc">
            {import.meta.env.DEV && this.state.error?.message
              ? this.state.error.message
              : 'An unexpected error occurred. Reload the page or try again.'}
          </p>
          <div className="error-boundary__actions">
            <Btn variant="primary" size="md" onClick={this.handleRetry}>
              Try again
            </Btn>
            <Btn variant="ghost" size="md" onClick={() => window.location.reload()}>
              Reload page
            </Btn>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
