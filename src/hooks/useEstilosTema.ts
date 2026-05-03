import { useCallback, useEffect, useState } from "react";
import { ESTILOS_DISPONIVEIS, type EstiloTema } from "@/lib/sugestoes-tema";

const STORAGE_KEY = "calendario-politico:estilos-tema";

function readStored(): EstiloTema[] {
  if (typeof window === "undefined") return [...ESTILOS_DISPONIVEIS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...ESTILOS_DISPONIVEIS];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...ESTILOS_DISPONIVEIS];
    const valid = arr.filter((x): x is EstiloTema =>
      ESTILOS_DISPONIVEIS.includes(x as EstiloTema),
    );
    return valid.length > 0 ? valid : [...ESTILOS_DISPONIVEIS];
  } catch {
    return [...ESTILOS_DISPONIVEIS];
  }
}

/**
 * Preferências por usuário (localStorage) dos estilos de sugestão de tema.
 * Visual-only: filtra o que aparece nos widgets / página de calendário.
 */
export function useEstilosTema() {
  const [estilos, setEstilos] = useState<EstiloTema[]>(() => readStored());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(estilos));
    } catch {
      // ignore quota / disabled storage
    }
  }, [estilos]);

  // Sincroniza entre abas / componentes
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEstilos(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((estilo: EstiloTema) => {
    setEstilos((prev) => {
      if (prev.includes(estilo)) {
        const next = prev.filter((e) => e !== estilo);
        return next.length === 0 ? prev : next; // não permite zerar
      }
      return [...prev, estilo];
    });
  }, []);

  const reset = useCallback(() => setEstilos([...ESTILOS_DISPONIVEIS]), []);

  const ativos = new Set<EstiloTema>(estilos);
  return { estilos, ativos, toggle, reset };
}