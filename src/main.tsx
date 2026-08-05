import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Limpa qualquer erro fatal anterior do sessionStorage para permitir reidratação limpa
try {
  if (typeof window !== "undefined") {
    // Remove flags de erro que o roteador possa ter persistido
    sessionStorage.removeItem('__ts_error');
    console.log("[main] Environment cleanup complete");
  }
} catch (e) {}

createRoot(document.getElementById("root")!).render(<App />);

// ──────────────────────────────────────────────────────────────────────
// PWA / Service Worker registration
// - Registra /sw.js fora do preview do Lovable
// - Verifica updates no load e ao voltar pra aba (visibilitychange)
// - Recarrega automaticamente quando um SW novo assume o controle
// - Mostra um toast "Nova versão disponível" como rede de segurança
// - Suporta ?sw=off como "botão de emergência" para destravar caches
// ──────────────────────────────────────────────────────────────────────
(() => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Botão de emergência: ?sw=off desregistra tudo e limpa caches
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sw") === "off") {
      (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch {}
        try {
          if (typeof caches !== "undefined") {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {}
        // Redireciona limpo
        const url = new URL(window.location.href);
        url.searchParams.delete("sw");
        window.location.replace(url.pathname + url.search + url.hash);
      })();
      return;
    }
  } catch {}

  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") || host.includes("lovableproject.com");

  if (isInIframe || isPreviewHost) {
    // Limpa qualquer SW que tenha sido registrado em preview
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    return;
  }

  // Recarrega quando o SW novo assumir o controle (uma única vez)
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  function showUpdateToast(waiting: ServiceWorker) {
    if (document.getElementById("__sw_update_toast")) return;
    const box = document.createElement("div");
    box.id = "__sw_update_toast";
    box.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:16px",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "background:#111827",
      "color:#fff",
      "padding:10px 14px",
      "border-radius:10px",
      "box-shadow:0 6px 20px rgba(0,0,0,.25)",
      "font:500 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      "display:flex",
      "gap:10px",
      "align-items:center",
      "max-width:92vw",
    ].join(";");
    box.innerHTML =
      '<span>Nova versão disponível</span>' +
      '<button id="__sw_update_btn" style="background:#22c55e;color:#fff;border:0;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer">Atualizar</button>';
    document.body.appendChild(box);
    document.getElementById("__sw_update_btn")?.addEventListener("click", () => {
      try { waiting.postMessage({ type: "SKIP_WAITING" }); } catch {}
      // Fallback: força reload caso o SW não dispare controllerchange
      setTimeout(() => window.location.reload(), 400);
    });
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Procura updates ao carregar e quando a aba volta a ficar visível
        const tryUpdate = () => { reg.update().catch(() => {}); };
        tryUpdate();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") tryUpdate();
        });

        // Se já existe um SW "waiting", mostra o aviso
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateToast(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(nw);
            }
          });
        });
      })
      .catch((err) => console.warn("SW register failed:", err));
  });
})();
