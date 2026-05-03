import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// ──────────────────────────────────────────────────────────────────────
// PWA / Service Worker registration
// Required so the browser shows the "Install app" prompt (beforeinstallprompt)
// and so push notifications keep working. We guard against the Lovable
// editor preview (iframe / preview hostnames) to avoid stale caches there.
// ──────────────────────────────────────────────────────────────────────
(() => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") || host.includes("lovableproject.com");

  if (isInIframe || isPreviewHost) {
    // Clean up any SW that may have been registered previously in preview
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW register failed:", err));
  });
})();
