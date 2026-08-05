import { ClientOnly, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";

const App = lazy(() => import("@/App"));

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error("[root route error]", error);
  }, [error]);

  const handleReset = () => {
    // Tenta limpar caches do roteador e do navegador
    try {
      router.invalidate();
    } catch (e) {
      console.warn("Failed to invalidate router:", e);
    }
    reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center p-6 border rounded-lg bg-card shadow-lg">
        <h1 className="text-2xl font-bold text-foreground">Erro de Inicialização</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu uma falha crítica ao carregar o sistema. Isso pode ser um problema de cache ou uma atualização pendente.
        </p>
        
        <div className="mt-4 p-4 bg-muted/50 rounded-md text-left border border-destructive/20 overflow-hidden">
          <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">Detalhes do erro:</p>
          <pre className="max-h-32 overflow-auto font-mono text-xs text-destructive break-all whitespace-pre-wrap">
            {error?.message || "Erro desconhecido"}
            {error?.stack && (
              <div className="mt-2 pt-2 border-t border-destructive/10 opacity-60">
                {error.stack}
              </div>
            )}
          </pre>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
          >
            Tentar novamente (Limpar Cache)
          </button>
          <div className="flex gap-2">
            <a
              href="/"
              className="flex-1 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Ir para o início
            </a>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sentinelle" },
      { name: "description", content: "Sentinelle" },
      { name: "author", content: "Sentinelle" },
      // Evita que tradutores automáticos (Chrome/Google Translate) substituam
      // text nodes do React e causem "Failed to execute 'removeChild'..."
      // que disparava a tela "Something went wrong" a cada navegação.
      { name: "google", content: "notranslate" },
      { httpEquiv: "Content-Language", content: "pt-BR" },
      { property: "og:title", content: "Sentinelle" },
      { property: "og:description", content: "Sentinelle" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/sentinelle-logo.png" },
      { rel: "apple-touch-icon", href: "/sentinelle-logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" translate="no" className="notranslate">
      <head>
        <HeadContent />
      </head>
      <body translate="no" className="notranslate">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ClientOnly fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando framework…</div>}>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>}>
        <App />
      </Suspense>
    </ClientOnly>
  );
}
