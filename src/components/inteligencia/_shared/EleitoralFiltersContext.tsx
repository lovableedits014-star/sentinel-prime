import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from "react";

export type AnoMode = "ambos" | "2022" | "2024";

export type EleitoralFilters = {
  uf: string;            // sigla UF ou "__all__"
  municipio: string;     // nome do município ou "__all__"
  anoMode: AnoMode;
  cargo: string;         // nome do cargo ou "__all__"
  partido: string;       // sigla ou "__all__"
};

type Ctx = EleitoralFilters & {
  setUf: (v: string) => void;
  setMunicipio: (v: string) => void;
  setAnoMode: (v: AnoMode) => void;
  setCargo: (v: string) => void;
  setPartido: (v: string) => void;
  reset: () => void;
  anos: number[]; // derivado de anoMode
};

const DEFAULT: EleitoralFilters = {
  uf: "MS",
  municipio: "__all__",
  anoMode: "ambos",
  cargo: "__all__",
  partido: "__all__",
};

const EleitoralFiltersCtx = createContext<Ctx | null>(null);

function readFromURL(): EleitoralFilters {
  if (typeof window === "undefined") return DEFAULT;
  const sp = new URLSearchParams(window.location.search);
  const ano = sp.get("ano");
  return {
    uf: sp.get("uf") || DEFAULT.uf,
    municipio: sp.get("municipio") || DEFAULT.municipio,
    anoMode: (ano === "2022" || ano === "2024" || ano === "ambos" ? ano : DEFAULT.anoMode) as AnoMode,
    cargo: sp.get("cargo") || DEFAULT.cargo,
    partido: sp.get("partido") || DEFAULT.partido,
  };
}

function writeToURL(f: EleitoralFilters) {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  const set = (k: string, v: string, def: string) => {
    if (v && v !== def) sp.set(k, v);
    else sp.delete(k);
  };
  set("uf", f.uf, DEFAULT.uf);
  set("municipio", f.municipio, DEFAULT.municipio);
  set("ano", f.anoMode, DEFAULT.anoMode);
  set("cargo", f.cargo, DEFAULT.cargo);
  set("partido", f.partido, DEFAULT.partido);
  const qs = sp.toString();
  const url = `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`;
  window.history.replaceState({}, "", url);
}

export function EleitoralFiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EleitoralFilters>(() => readFromURL());

  useEffect(() => { writeToURL(state); }, [state]);

  // Mudar UF/Ano invalida município e cargo (combinações podem não existir)
  const setUf = useCallback(
    (uf: string) => setState((s) => ({ ...s, uf, municipio: "__all__", cargo: "__all__" })),
    [],
  );
  const setMunicipio = useCallback((municipio: string) => setState((s) => ({ ...s, municipio })), []);
  const setAnoMode = useCallback(
    (anoMode: AnoMode) => setState((s) => ({ ...s, anoMode, cargo: "__all__", municipio: "__all__" })),
    [],
  );
  const setCargo = useCallback((cargo: string) => setState((s) => ({ ...s, cargo })), []);
  const setPartido = useCallback((partido: string) => setState((s) => ({ ...s, partido })), []);
  const reset = useCallback(() => setState(DEFAULT), []);

  const anos = useMemo(
    () => (state.anoMode === "ambos" ? [2022, 2024] : [Number(state.anoMode)]),
    [state.anoMode],
  );

  const value: Ctx = { ...state, setUf, setMunicipio, setAnoMode, setCargo, setPartido, reset, anos };
  return <EleitoralFiltersCtx.Provider value={value}>{children}</EleitoralFiltersCtx.Provider>;
}

/** Hook obrigatório dentro do provider */
export function useEleitoralFilters(): Ctx {
  const ctx = useContext(EleitoralFiltersCtx);
  if (!ctx) throw new Error("useEleitoralFilters precisa do <EleitoralFiltersProvider>");
  return ctx;
}

/** Hook opcional — retorna null se fora do provider (retrocompat) */
export function useEleitoralFiltersOptional(): Ctx | null {
  return useContext(EleitoralFiltersCtx);
}