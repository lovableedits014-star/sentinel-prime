import { useCallback, useEffect, useState } from "react";
import type { ContextoArte } from "@/lib/prompt-arte-feriado";

const STORAGE_KEY = "calendario-politico:contexto-arte";

function read(): ContextoArte {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return typeof obj === "object" && obj ? obj : {};
  } catch {
    return {};
  }
}

/**
 * Contexto persistido do candidato/marca usado para injetar nos prompts de arte.
 * Tudo opcional — o prompt funciona mesmo vazio (deixa a assinatura genérica).
 */
export function useContextoArte() {
  const [ctx, setCtx] = useState<ContextoArte>(() => read());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
    } catch {
      /* ignore */
    }
  }, [ctx]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCtx(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((partial: Partial<ContextoArte>) => {
    setCtx((prev) => ({ ...prev, ...partial }));
  }, []);

  return { ctx, update };
}