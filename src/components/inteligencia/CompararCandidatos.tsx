import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GitCompareArrows, Plus, X, Search, Download, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type CandidatoSel = { nome: string; partido: string | null };
type BreakdownRow = {
  uf: string;
  municipio: string;
  cargo: string;
  ano: number;
  partido: string | null;
  nome_urna: string | null;
  votos: number;
};

type ChapaSearchRow = {
  nome_completo: string;
  nome_urna: string | null;
  partido: string | null;
  cargos: string;
  ufs: string;
  municipios: string;
  votos_2022: number;
  votos_2024: number;
  total: number;
};

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444"];

export default function CompararCandidatos() {
  const [anoMode, setAnoMode] = useState<"ambos" | "2022" | "2024">("ambos");
  const [uf, setUf] = useState<string>("MS");
  const [topN, setTopN] = useState<string>("15");
  const [selecionados, setSelecionados] = useState<CandidatoSel[]>([]);

  const anos = anoMode === "ambos" ? [2022, 2024] : anoMode === "2022" ? [2022] : [2024];

  // UFs disponíveis
  const { data: ufs = [] } = useQuery({
    queryKey: ["compare-ufs"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_municipios" as any);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((r: any) => r.uf && set.add(r.uf));
      return Array.from(set).sort();
    },
  });

  // Busca breakdown para cada candidato selecionado
  const queries = useQueries({
    queries: selecionados.map((c) => ({
      queryKey: ["compare-breakdown", c.nome, c.partido, anoMode, uf],
      staleTime: Infinity,
      queryFn: async () => {
        const { data, error } = await supabase.rpc("get_candidate_breakdown" as any, {
          p_nome: c.nome,
          p_partido: c.partido || null,
          p_anos: anos,
          p_uf: uf === "__all__" ? null : uf,
          p_cargo: null,
        });
        if (error) throw error;
        return (data || []) as BreakdownRow[];
      },
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const adicionar = (c: CandidatoSel) => {
    if (selecionados.length >= 4) {
      toast.error("Máximo de 4 candidatos por comparação");
      return;
    }
    if (selecionados.find((x) => x.nome === c.nome && x.partido === c.partido)) {
      toast.info("Candidato já adicionado");
      return;
    }
    setSelecionados([...selecionados, c]);
  };

  const remover = (i: number) => setSelecionados(selecionados.filter((_, idx) => idx !== i));

  // Agrega por município totalizando entre os candidatos
  const dadosUnificados = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    selecionados.forEach((c, i) => {
      const rows = queries[i]?.data || [];
      const key = `${c.nome}__${c.partido || ""}`;
      // soma por município
      const porMun = new Map<string, number>();
      rows.forEach((r) => {
        porMun.set(r.municipio, (porMun.get(r.municipio) || 0) + r.votos);
      });
      porMun.forEach((votos, municipio) => {
        const cur = map.get(municipio) || { municipio, total: 0 };
        cur[key] = votos;
        cur.total += votos;
        map.set(municipio, cur);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [selecionados, queries]);

  const N = Math.max(1, Math.min(50, Number(topN) || 15));
  const topMunicipios = dadosUnificados.slice(0, N);

  const totaisPorCandidato = useMemo(() => {
    return selecionados.map((c, i) => {
      const rows = queries[i]?.data || [];
      const total = rows.reduce((s, r) => s + r.votos, 0);
      const v2022 = rows.filter((r) => r.ano === 2022).reduce((s, r) => s + r.votos, 0);
      const v2024 = rows.filter((r) => r.ano === 2024).reduce((s, r) => s + r.votos, 0);
      const municipios = new Set(rows.map((r) => r.municipio)).size;
      return { ...c, total, v2022, v2024, municipios };
    });
  }, [selecionados, queries]);

  const fmt = (n: number) => (n || 0).toLocaleString("pt-BR");

  const exportar = () => {
    if (dadosUnificados.length === 0) return;
    const sheet = dadosUnificados.map((r) => {
      const linha: any = { Município: r.municipio };
      selecionados.forEach((c) => {
        const key = `${c.nome}__${c.partido || ""}`;
        linha[`${c.nome} (${c.partido || "—"})`] = r[key] || 0;
      });
      linha["Total"] = r.total;
      return linha;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Comparação");
    XLSX.writeFile(wb, `comparacao_candidatos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitCompareArrows className="w-5 h-5 text-primary" /> Comparador de Candidatos
          </CardTitle>
          <CardDescription>
            Selecione de 2 a 4 candidatos para comparar lado a lado a força eleitoral em cada município. Útil para identificar redutos exclusivos, sobreposições e potenciais alianças ou disputas pelo mesmo eleitorado.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Seleção e filtros */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={anoMode} onValueChange={(v: any) => setAnoMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambos">2022 + 2024</SelectItem>
                  <SelectItem value="2022">Somente 2022</SelectItem>
                  <SelectItem value="2024">Somente 2024</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">UF</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {(ufs as string[]).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Top N municípios no gráfico</Label>
              <Input type="number" min={5} max={50} value={topN} onChange={(e) => setTopN(e.target.value)} />
            </div>
            <div className="flex items-end">
              <CandidatoPicker onSelect={adicionar} disabled={selecionados.length >= 4} />
            </div>
          </div>

          {/* Chips dos selecionados */}
          {selecionados.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded p-4 text-center">
              Adicione pelo menos 2 candidatos para iniciar a comparação.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selecionados.map((c, i) => (
                <div key={i} className="flex items-center gap-2 border rounded-full pl-3 pr-1 py-1 text-sm" style={{ borderColor: COLORS[i] }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                  <span className="font-medium">{c.nome}</span>
                  {c.partido && <Badge variant="outline" className="text-[10px]">{c.partido}</Badge>}
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => remover(i)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo por candidato */}
      {selecionados.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {totaisPorCandidato.map((t, i) => (
            <Card key={i} style={{ borderTop: `3px solid ${COLORS[i]}` }}>
              <CardContent className="pt-3 pb-3">
                <div className="text-xs text-muted-foreground truncate" title={t.nome}>{t.nome}</div>
                <div className="text-xs text-muted-foreground mb-2">{t.partido || "—"}</div>
                <div className="text-2xl font-bold tabular-nums">{fmt(t.total)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {t.municipios} municípios · 2022: {fmt(t.v2022)} · 2024: {fmt(t.v2024)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Gráfico comparativo */}
      {selecionados.length >= 1 && topMunicipios.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Top {N} municípios — votos por candidato
            </CardTitle>
            <CardDescription className="text-xs">
              Barras agrupadas mostram o desempenho de cada candidato nos municípios com maior soma combinada de votos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full h-[420px]">
              <ResponsiveContainer>
                <BarChart data={topMunicipios} margin={{ top: 8, right: 16, left: 0, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="municipio" angle={-40} textAnchor="end" interval={0} height={90} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                  <Tooltip
                    formatter={(v: any) => fmt(Number(v))}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {selecionados.map((c, i) => (
                    <Bar
                      key={`${c.nome}__${c.partido}`}
                      dataKey={`${c.nome}__${c.partido || ""}`}
                      name={`${c.nome}${c.partido ? ` (${c.partido})` : ""}`}
                      fill={COLORS[i]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela ranking */}
      {selecionados.length >= 1 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Ranking por município</CardTitle>
              <CardDescription className="text-xs">
                Em cada linha, o vencedor entre os comparados é destacado. Total = soma dos selecionados naquela cidade.
              </CardDescription>
            </div>
            <Button onClick={exportar} variant="outline" size="sm" disabled={dadosUnificados.length === 0}>
              <Download className="w-4 h-4 mr-2" /> Excel
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="text-center py-10 text-sm text-muted-foreground">Carregando dados...</div>
            ) : dadosUnificados.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">Sem dados para os candidatos selecionados.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Município</TableHead>
                    {selecionados.map((c, i) => (
                      <TableHead key={i} className="text-right">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                          {c.nome.split(" ")[0]}{c.partido ? ` (${c.partido})` : ""}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosUnificados.slice(0, 200).map((r, idx) => {
                    // descobre vencedor
                    let maxKey = "";
                    let maxVal = -1;
                    selecionados.forEach((c) => {
                      const k = `${c.nome}__${c.partido || ""}`;
                      const v = r[k] || 0;
                      if (v > maxVal) { maxVal = v; maxKey = k; }
                    });
                    return (
                      <TableRow key={r.municipio}>
                        <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{r.municipio}</TableCell>
                        {selecionados.map((c, i) => {
                          const k = `${c.nome}__${c.partido || ""}`;
                          const v = r[k] || 0;
                          const isWinner = k === maxKey && v > 0;
                          return (
                            <TableCell key={i} className={`text-right tabular-nums ${isWinner ? "font-bold" : ""}`} style={isWinner ? { color: COLORS[i] } : {}}>
                              {v ? fmt(v) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right tabular-nums font-semibold">{fmt(r.total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {dadosUnificados.length > 200 && (
              <div className="text-xs text-muted-foreground p-3 border-t">
                Exibindo os 200 primeiros de {dadosUnificados.length} municípios. Exporte o Excel para ver todos.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============== Picker com busca em RPC ===============
function CandidatoPicker({ onSelect, disabled }: { onSelect: (c: CandidatoSel) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: candidatos = [], isLoading } = useQuery({
    enabled: open && search.trim().length >= 2,
    queryKey: ["picker-candidatos", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_chapa_candidates" as any, {
        p_uf: null,
        p_municipio: null,
        p_anos: [2022, 2024],
        p_cargos: null,
        p_partido: null,
        p_min_votos: 0,
        p_search: search.trim(),
      });
      if (error) throw error;
      return ((data || []) as ChapaSearchRow[]).slice(0, 50);
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" disabled={disabled} className="w-full">
          <Plus className="w-4 h-4 mr-2" /> Adicionar candidato
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Digite ao menos 2 letras do nome..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-72">
            {search.trim().length < 2 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">Digite parte do nome para buscar.</div>
            ) : isLoading ? (
              <div className="p-4 text-xs text-muted-foreground text-center">Buscando...</div>
            ) : candidatos.length === 0 ? (
              <CommandEmpty>Nenhum candidato encontrado.</CommandEmpty>
            ) : (
              <CommandGroup>
                {candidatos.map((c, i) => (
                  <CommandItem
                    key={`${c.nome_completo}-${c.partido}-${i}`}
                    onSelect={() => {
                      onSelect({ nome: c.nome_completo, partido: c.partido });
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.nome_completo}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {c.partido || "—"} · {c.cargos} · {(c.total || 0).toLocaleString("pt-BR")} votos
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}