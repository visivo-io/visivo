import React from 'react';
import { PiArrowClockwise, PiWarning } from 'react-icons/pi';

class ExplorerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ExplorerErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full gap-3 p-4 bg-gray-50"
          data-testid="error-boundary-fallback"
        >
          <PiWarning size={24} className="text-secondary-400" />
          <span className="text-sm text-secondary-500">
            {this.props.fallback || 'Something went wrong'}
          </span>
          <button
            type="button"
            onClick={this.handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <PiArrowClockwise size={12} />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ExplorerErrorBoundary;
