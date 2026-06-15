import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-xl border border-slate-100 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">Kuch gadbad ho gayi</h2>
            <p className="text-slate-500 text-sm mb-6">
              App mein ek unexpected error aaya. Page refresh karein.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-transform"
            >
              Page Refresh Karein
            </button>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-4 text-left text-[9px] text-red-500 bg-red-50 rounded-xl p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                {this.state.error.toString()}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
