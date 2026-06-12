// Carrega o script do Google Maps JS API uma única vez globalmente.
import { useEffect, useState } from "react";

let loadingPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) {
    return Promise.reject(new Error("Google Maps browser key não configurada"));
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    (window as any).__lovableGmapsInit = () => resolve();
    const script = document.createElement("script");
    const channelParam = channel ? `&channel=${channel}` : "";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=visualization&callback=__lovableGmapsInit${channelParam}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("Falha ao carregar Google Maps"));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}

export function useGoogleMaps() {
  const [loaded, setLoaded] = useState<boolean>(() => !!(typeof window !== "undefined" && (window as any).google?.maps));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    loadScript()
      .then(() => { if (!cancelled) setLoaded(true); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Erro"); });
    return () => { cancelled = true; };
  }, [loaded]);

  return { loaded, error };
}
