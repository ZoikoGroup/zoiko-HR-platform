import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/login";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0A0F1C] p-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-[#111827] p-8 text-center shadow-2xl">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <h2 className="mt-4 text-xl font-bold text-white">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-400">
              An unexpected error occurred. Please try signing in again.
            </p>
            {this.state.error && (
              <p className="mt-3 rounded-xl bg-slate-800/60 px-3 py-2 text-xs text-red-400 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B00] to-[#FF8C38] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-105"
            >
              <RefreshCw className="h-4 w-4" />
              Back to Login
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
