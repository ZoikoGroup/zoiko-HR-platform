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

  // A page boundary clears itself when the route changes (resetKey = the pathname), so an error on one page does not
  // stay on screen after the user navigates somewhere else.
  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/login";
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.props.inline) {
      // Inside the portal shell: show the problem in the content area; the sidebar and header stay usable.
      return (
        <div role="alert" className="mx-auto my-12 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">This page ran into a problem</h2>
          <p className="mt-1 text-sm text-slate-600">The rest of the app still works. Try again, or open another page from the menu.</p>
          {import.meta.env.DEV && this.state.error && (
            <p className="mt-3 break-all rounded-xl bg-white px-3 py-2 text-xs text-red-600">{this.state.error.message}</p>
          )}
          <button type="button" onClick={this.handleRetry} className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0A0F1C] p-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-[#111827] p-8 text-center shadow-2xl">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <h2 className="mt-4 text-xl font-bold text-white">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-400">
              An unexpected error occurred. Please try signing in again.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <p className="mt-3 rounded-xl bg-slate-800/60 px-3 py-2 text-xs text-red-400 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-105"
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
