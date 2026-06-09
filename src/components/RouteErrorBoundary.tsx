import React from "react";
import { logTelemetry } from "@/lib/client-telemetry";

interface Props {
  children: React.ReactNode;
  /** Quando muda, o boundary se reseta automaticamente (passar location.pathname). */
  resetKey?: string;
  /** Callback opcional, ex.: navegar para /dashboard. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Boundary de página (defesa em profundidade — Onda 3).
 *
 * - Captura erros de render/efeito de cada rota sem derrubar o app inteiro.
 * - Reseta automaticamente quando `resetKey` muda (tipicamente o pathname),
 *   evitando o "ficou preso na tela de erro" entre navegações.
 * - Loga o erro completo no console + telemetria para diagnóstico.
 */
export default class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log cru — preserva stack para o DevTools.
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", error, info.componentStack);
    try {
      (window as any).__lastRenderError = {
        message: error?.message,
        stack: error?.stack,
        componentStack: info.componentStack,
        at: new Date().toISOString(),
        pathname: window.location.pathname,
      };
    } catch {}
    try {
      logTelemetry("render_error", {
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
        message: error?.message,
        stack: (error?.stack || "").split("\n").slice(0, 5).join("\n"),
      });
    } catch {}
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = import.meta.env?.DEV;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-4 rounded-lg border bg-card p-6 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="h-6 w-6 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Algo deu errado nesta tela</h2>
            <p className="text-sm text-muted-foreground">
              Você pode continuar usando o sistema normalmente. Clique no menu para abrir outra página.
            </p>
          </div>
          {isDev && this.state.error.message && (
            <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-left font-mono text-[11px] text-destructive">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Tentar novamente
            </button>
            <button
              onClick={() => { window.location.href = "/dashboard"; }}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Ir para Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
