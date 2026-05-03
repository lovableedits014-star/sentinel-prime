import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, MapPin, Calendar, Briefcase, Filter, RotateCcw } from "lucide-react";
import { useEleitoralFilters, AnoMode } from "./EleitoralFiltersContext";

type Row = { uf: string; municipio: string | null; cargo: string | null; ano: number };

export default function EleitoralScopeBar() {
  const f = useEleitoralFilters();

  // Carrega TODA a dimensão (uf, municipio, cargo, ano) com paginação,
  // pois o Supabase limita 1000 linhas por requisição.
  const { data: dim } = useQuery({
    queryKey: ["eleitoral-dim-all"],
    staleTime: Infinity,
    queryFn: async () => {
      const PAGE = 1000;
      const MAX = 200000;
      let from = 0;
      const all: Row[] = [];
      while (from < MAX) {
        const { data, error } = await supabase
          .from("tse_votacao_zona" as any)
          .select("uf,municipio,cargo,ano")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = ((data as any) as Row[]) || [];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });

  // Cascata real: cada dropdown reflete combinações válidas dos outros filtros.
  // Regra: opções de UF independem do resto; município depende de UF+ano+cargo;
  // cargo depende de UF+município+ano; ano depende de UF+município+cargo.
  const matchAno = (r: Row) => f.anoMode === "ambos" || r.ano === Number(f.anoMode);
  const matchUf = (r: Row) => f.uf === "__all__" || r.uf === f.uf;
  const matchMuni = (r: Row) => f.municipio === "__all__" || r.municipio === f.municipio;
  const matchCargo = (r: Row) => f.cargo === "__all__" || r.cargo === f.cargo;

  const ufs = useMemo(() => {
    const s = new Set<string>();
    (dim || []).forEach((r) => { if (r.uf) s.add(r.uf); });
    return Array.from(s).sort();
  }, [dim]);

  const municipios = useMemo(() => {
    if (f.uf === "__all__") return [] as string[];
    const s = new Set<string>();
    (dim || []).forEach((r) => {
      if (matchUf(r) && matchAno(r) && matchCargo(r) && r.municipio) s.add(r.municipio);
    });
    return Array.from(s).sort();
  }, [dim, f.uf, f.anoMode, f.cargo]);

  const cargos = useMemo(() => {
    const s = new Set<string>();
    (dim || []).forEach((r) => {
      if (matchUf(r) && matchMuni(r) && matchAno(r) && r.cargo) s.add(r.cargo);
    });
    return Array.from(s).sort();
  }, [dim, f.uf, f.municipio, f.anoMode]);

  const anosDisponiveis = useMemo(() => {
    const s = new Set<number>();
    (dim || []).forEach((r) => {
      if (matchUf(r) && matchMuni(r) && matchCargo(r) && r.ano) s.add(r.ano);
    });
    return Array.from(s).sort();
  }, [dim, f.uf, f.municipio, f.cargo]);

  const has2022 = anosDisponiveis.includes(2022);
  const has2024 = anosDisponiveis.includes(2024);

  const breadcrumb: { label: string; tone?: "muted" | "primary" }[] = [
    { label: f.uf === "__all__" ? "Brasil" : f.uf, tone: "primary" },
    ...(f.municipio !== "__all__" ? [{ label: f.municipio, tone: "primary" as const }] : []),
    { label: f.cargo === "__all__" ? "Todos cargos" : f.cargo },
    { label: f.anoMode === "ambos" ? "2022 + 2024" : f.anoMode },
  ];

  return (
    <div className="rounded-lg border bg-card/50 p-3 space-y-3">
      {/* Breadcrumb de escopo */}
      <div className="flex items-center gap-1.5 flex-wrap text-sm">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">Escopo atual:</span>
        {breadcrumb.map((b, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
            <Badge variant={b.tone === "primary" ? "default" : "secondary"} className="font-medium">
              {b.label}
            </Badge>
          </span>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs gap-1"
          onClick={f.reset}
        >
          <RotateCcw className="w-3 h-3" /> Limpar
        </Button>
      </div>

      {/* Seletores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FilterField icon={<MapPin className="w-3.5 h-3.5" />} label="UF">
          <Select value={f.uf} onValueChange={f.setUf}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todas as UFs</SelectItem>
              {ufs.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<MapPin className="w-3.5 h-3.5" />} label="Município">
          <Select value={f.municipio} onValueChange={f.setMunicipio} disabled={f.uf === "__all__"}>
            <SelectTrigger>
              <SelectValue placeholder={
                f.uf === "__all__" ? "Selecione UF" :
                municipios.length === 0 ? "Sem dados p/ filtro" : "Todos"
              } />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todos os municípios ({municipios.length})</SelectItem>
              {municipios.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<Briefcase className="w-3.5 h-3.5" />} label="Cargo">
          <Select value={f.cargo} onValueChange={f.setCargo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">Todos cargos ({cargos.length})</SelectItem>
              {cargos.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<Calendar className="w-3.5 h-3.5" />} label="Ano">
          <Select value={f.anoMode} onValueChange={(v) => f.setAnoMode(v as AnoMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos" disabled={!has2022 && !has2024}>2022 + 2024</SelectItem>
              <SelectItem value="2022" disabled={!has2022}>
                Só 2022 {!has2022 ? "(sem dados)" : ""}
              </SelectItem>
              <SelectItem value="2024" disabled={!has2024}>
                Só 2024 {!has2024 ? "(sem dados)" : ""}
              </SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </div>

      {/* Aviso quando combinação atual tem dados zerados */}
      {dim && f.uf !== "__all__" && (cargos.length === 0 || anosDisponiveis.length === 0) && (
        <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <Filter className="w-3 h-3" />
          Nenhum dado para esta combinação. Tente limpar os filtros.
        </div>
      )}
    </div>
  );
}

function FilterField({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}