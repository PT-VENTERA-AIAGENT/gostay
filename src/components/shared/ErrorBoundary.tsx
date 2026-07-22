import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional label so logs/telemetry can tell which boundary caught it. */
  boundary?: string;
}

interface State {
  error: Error | null;
}

/**
 * App-wide error handler.
 *
 * React unmounts the whole tree when a render throws and nothing catches it —
 * which is exactly the "halaman kosong / blank putih" symptom, with no clue to
 * the user about what happened. This boundary turns any such crash into a
 * readable fallback page with a reload and a way back home, and logs the error
 * (component stack included) so the real cause is recoverable.
 *
 * It is a class component because `getDerivedStateFromError` /
 * `componentDidCatch` have no hooks equivalent — that is the only way React
 * exposes render-error catching.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the console breadcrumb even in production — this is often the only
    // record of a client crash we get.
    console.error(
      `[ErrorBoundary${this.props.boundary ? `:${this.props.boundary}` : ""}]`,
      error,
      info.componentStack,
    );
  }

  handleReload = () => {
    // A hard reload re-runs the app from a clean state; safer than trying to
    // reset in place when we do not know what corrupted the render.
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Surface the message only outside production, so a stack trace never leaks
    // to guests but is right there while developing.
    const showDetail = import.meta.env.DEV;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Terjadi kesalahan</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Maaf, halaman ini gagal dimuat. Silakan muat ulang, atau kembali ke beranda.
          </p>

          {showDetail && (
            <pre className="text-left text-xs bg-muted text-muted-foreground rounded-lg p-3 mb-6 overflow-auto max-h-48 whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" /> Muat ulang
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-2 border border-border px-4 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Home className="w-4 h-4" /> Beranda
            </a>
          </div>
        </div>
      </div>
    );
  }
}
