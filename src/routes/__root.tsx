import { ClientOnly, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import App from "@/App";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";

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
      { property: "og:image", content: "/sentinelle-logo.png" },
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
    <ClientOnly fallback={<div />}>
      <App />
    </ClientOnly>
  );
}
