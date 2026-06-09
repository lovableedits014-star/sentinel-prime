import { useEffect } from "react";
import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { logTelemetry } from "@/lib/client-telemetry";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  // Log + telemetria assim que o boundary renderiza.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[router DefaultErrorComponent]", error);
    try {
      (window as any).__lastRenderError = {
        message: error?.message,
        stack: error?.stack,
        at: new Date().toISOString(),
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      };
    } catch {}
    try {
      logTelemetry("render_error", {
        scope: "tanstack_default",
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
        message: error?.message,
        stack: (error?.stack || "").split("\n").slice(0, 5).join("\n"),
      });
    } catch {}
  }, [error]);

  // Auto-reset: se a URL mudar (ex.: usuário clicou em outro item do menu da SPA
  // interna em react-router-dom), o boundary se limpa sozinho para não prender
  // o usuário nesta tela.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const initial = window.location.pathname + window.location.search;
    const check = () => {
      const current = window.location.pathname + window.location.search;
      if (current !== initial) {
        router.invalidate();
        reset();
      }
    };
    window.addEventListener("popstate", check);
    const interval = window.setInterval(check, 400);
    return () => {
      window.removeEventListener("popstate", check);
      window.clearInterval(interval);
    };
  }, [router, reset]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {import.meta.env.DEV && error.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
