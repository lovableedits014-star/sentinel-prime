import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users2, Plus, X, Download, MapPin, Vote, Layers, Target } from "lucide-react";
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

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#a855f7",
];

export default function SimuladorChapa() {
  const [anoMode, setAnoMode] = useState<"ambos" | "2022" | "2024">("ambos");
  const [uf, setUf] = useState<string>("MS");
  const [chapa, setChapa] = useState<CandidatoSel[]>([]);

  const anos = anoMode === "ambos" ? [2022, 2024] : [Number(anoMode)];

  const { data: ufs = [] } = useQuery({
    queryKey: ["sim-ufs"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_municipios" as any);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((r: any) => r.uf && set.add(r.uf));
      return Array.from(set).sort();
    },
  });

  const { data: universoMunicipios = [] } = useQuery({
    queryKey: ["sim-universo", uf],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_municipios" as any);
      if (error) throw error;
      return ((data || []) as any[])
        .filter((r) => uf === "__all__" || r.uf === uf)
        .map((r) => ({ uf: r.uf as string, municipio: r.municipio as string }));
    },
  });

  const queries = useQueries({
    queries: chapa.map((c) => ({
      queryKey: ["sim-breakdown", c.nome, c.partido, anoMode, uf],
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
    if (chapa.length >= 12) { toast.error("Limite de 12 candidatos na chapa"); return; }
    if (chapa.find((x) => x.nome === c.nome && x.partido === c.partido)) {
      toast.info("Candidato já está na chapa"); return;
    }
    setChapa([...chapa, c]);
  };
  const remover = (i: number) => setChapa(chapa.filter((_, idx) => idx !== i));
  const limpar = () => setChapa([]);

  const porCandidato = useMemo(() => {
    return chapa.map((c, i) => {
      const rows = queries[i]?.data || [];
      const total = rows.reduce((s, r) => s + r.votos, 0);
      const v2022 = rows.filter((r) => r.ano === 2022).reduce((s, r) => s + r.votos, 0);
      const v2024 = rows.filter((r) => r.ano === 2024).reduce((s, r) => s + r.votos, 0);
      const mun = new Set(rows.map((r) => r.municipio));
      return { ...c, total, v2022, v2024, municipios: mun.size, color: PALETTE[i % PALETTE.length] };
    });
  }, [chapa, queries]);

  const porMunicipio = useMemo(() => {
    const map = new Map<string, { uf: string; municipio: string; total: number; v2022: number; v2024: number; presentes: number; porCand: Record<string, number> }>();
    chapa.forEach((c, i) => {
      const rows = queries[i]?.data || [];
      const key = `${c.nome}__${c.partido || ""}`;
      const porMun = new Map<string, { uf: string; v2022: number; v2024: number; total: number }>();
      rows.forEach((r) => {
        const cur = porMun.get(r.municipio) || { uf: r.uf, v2022: 0, v2024: 0, total: 0 };
        cur.total += r.votos;
        if (r.ano === 2022) cur.v2022 += r.votos;
        if (r.ano === 2024) cur.v2024 += r.votos;
        porMun.set(r.municipio, cur);
      });
      porMun.forEach((v, municipio) => {
        const cur = map.get(municipio) || { uf: v.uf, municipio, total: 0, v2022: 0, v2024: 0, presentes: 0, porCand: {} };
        cur.porCand[key] = v.total;
        cur.total += v.total;
        cur.v2022 += v.v2022;
        cur.v2024 += v.v2024;
        if (v.total > 0) cur.presentes += 1;
        map.set(municipio, cur);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [chapa, queries]);

  const porUF = useMemo(() => {
    const map = new Map<string, {
      uf: string;
      total: number; v2022: number; v2024: number;
      municipiosCobertos: Set<string>;
      porCand: Record<string, { votos: number; municipios: Set<string> }>;
    }>();
    chapa.forEach((c, i) => {
      const rows = queries[i]?.data || [];
      const key = `${c.nome}__${c.partido || ""}`;
      rows.forEach((r) => {
        const cur = map.get(r.uf) || {
          uf: r.uf, total: 0, v2022: 0, v2024: 0,
          municipiosCobertos: new Set<string>(), porCand: {},
        };
        cur.total += r.votos;
        if (r.ano === 2022) cur.v2022 += r.votos;
        if (r.ano === 2024) cur.v2024 += r.votos;
        cur.municipiosCobertos.add(r.municipio);
        const pc = cur.porCand[key] || { votos: 0, municipios: new Set<string>() };
        pc.votos += r.votos;
        pc.municipios.add(r.municipio);
        cur.porCand[key] = pc;
        map.set(r.uf, cur);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [chapa, queries]);

  const totalChapa = porCandidato.reduce((s, c) => s + c.total, 0);
  const total2022 = porCandidato.reduce((s, c) => s + c.v2022, 0);
  const total2024 = porCandidato.reduce((s, c) => s + c.v2024, 0);
  const cobertura = porMunicipio.length;
  const universoCount = universoMunicipios.length;
  const pctCobertura = universoCount > 0 ? (cobertura / universoCount) * 100 : 0;
  const sobreposicao = porMunicipio.filter((m) => m.presentes > 1).length;
  const exclusivos = porMunicipio.filter((m) => m.presentes === 1).length;
  const gaps = useMemo(() => {
    const cobertos = new Set(porMunicipio.map((m) => m.municipio));
    return universoMunicipios.filter((m) => !cobertos.has(m.municipio));
  }, [porMunicipio, universoMunicipios]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

  // Universo de municípios por UF (para % cobertura por UF na aba "Por UF")
  const universoPorUF = useMemo(() => {
    const m = new Map<string, number>();
    universoMunicipios.forEach((u) => m.set(u.uf, (m.get(u.uf) || 0) + 1));
    return m;
  }, [universoMunicipios]);

  const exportar = () => {
    if (porMunicipio.length === 0) return;
    const wb = XLSX.utils.book_new();

    // 1. Resumo
    const resumoSheet = [
      { Métrica: "Candidatos na chapa", Valor: chapa.length },
      { Métrica: "Votos totais (soma da chapa)", Valor: totalChapa },
      { Métrica: "Votos 2022", Valor: total2022 },
      { Métrica: "Votos 2024", Valor: total2024 },
      { Métrica: "Municípios cobertos", Valor: cobertura },
      { Métrica: "Universo de municípios (UF)", Valor: universoCount },
      { Métrica: "% cobertura", Valor: `${pctCobertura.toFixed(2)}%` },
      { Métrica: "Municípios com sobreposição (>1 candidato)", Valor: sobreposicao },
      { Métrica: "Municípios cobertos por apenas 1 candidato", Valor: exclusivos },
      { Métrica: "Municípios sem cobertura (gaps)", Valor: gaps.length },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoSheet), "Resumo");

    // 2. Por candidato
    const candSheet = porCandidato.map((c) => ({
      Candidato: c.nome,
      Partido: c.partido || "—",
      "Votos 2022": c.v2022,
      "Votos 2024": c.v2024,
      "Total votos": c.total,
      "Municípios alcançados": c.municipios,
      "% da chapa": totalChapa > 0 ? Number(((c.total / totalChapa) * 100).toFixed(2)) : 0,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(candSheet), "Por candidato");

    // 3. Por município
    const munSheet = porMunicipio.map((m) => {
      const linha: any = {
        UF: m.uf, Município: m.municipio,
        "Candidatos presentes": m.presentes,
        "Votos 2022": m.v2022, "Votos 2024": m.v2024,
      };
      chapa.forEach((c) => {
        const k = `${c.nome}__${c.partido || ""}`;
        linha[`${c.nome} (${c.partido || "—"})`] = m.porCand[k] || 0;
      });
      linha["Total chapa"] = m.total;
      linha["% do total chapa"] = totalChapa > 0 ? Number(((m.total / totalChapa) * 100).toFixed(2)) : 0;
      return linha;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(munSheet), "Por município");

    // 4. Por UF (NOVO)
    const ufSheet = porUF.map((u) => {
      const universoUF = universoPorUF.get(u.uf) || 0;
      const linha: any = {
        UF: u.uf,
        "Votos 2022": u.v2022,
        "Votos 2024": u.v2024,
        "Total votos": u.total,
        "% do total chapa": totalChapa > 0 ? Number(((u.total / totalChapa) * 100).toFixed(2)) : 0,
        "Municípios cobertos": u.municipiosCobertos.size,
        "Universo municípios UF": universoUF,
        "% cobertura UF": universoUF > 0 ? Number(((u.municipiosCobertos.size / universoUF) * 100).toFixed(2)) : 0,
      };
      chapa.forEach((c) => {
        const k = `${c.nome}__${c.partido || ""}`;
        const pc = u.porCand[k];
        linha[`${c.nome} (${c.partido || "—"}) — votos`] = pc?.votos || 0;
        linha[`${c.nome} (${c.partido || "—"}) — municípios`] = pc?.municipios.size || 0;
      });
      return linha;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ufSheet), "Por UF");

    // 5. Matriz município x candidato (NOVO)
    // Layout: linhas = município, colunas = cada candidato + Total + Presentes; última linha = TOTAL por candidato
    const candKeys = chapa.map((c) => ({ key: `${c.nome}__${c.partido || ""}`, label: `${c.nome} (${c.partido || "—"})` }));
    const matrizRows: any[] = porMunicipio.map((m) => {
      const linha: any = { UF: m.uf, Município: m.municipio };
      candKeys.forEach((c) => { linha[c.label] = m.porCand[c.key] || 0; });
      linha["Total município"] = m.total;
      linha["Presentes"] = m.presentes;
      return linha;
    });
    // Linha totalizadora
    const totalRow: any = { UF: "—", Município: "TOTAL" };
    candKeys.forEach((c) => {
      totalRow[c.label] = porMunicipio.reduce((s, m) => s + (m.porCand[c.key] || 0), 0);
    });
    totalRow["Total município"] = totalChapa;
    totalRow["Presentes"] = "—";
    matrizRows.push(totalRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrizRows), "Matriz município x cand");

    // 6. Gaps
    if (gaps.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(gaps.map((m) => ({ UF: m.uf, Município: m.municipio, Status: "Sem cobertura" }))),
        "Gaps"
      );
    }

    XLSX.writeFile(wb, `simulador_chapa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users2 className="w-5 h-5 text-primary" /> Simulador de Chapa
          </CardTitle>
          <CardDescription>
            Monte uma chapa hipotética adicionando candidatos e veja a soma total de votos consolidada,
            a cobertura territorial (quantos municípios a chapa atinge), sobreposição entre candidatos
            e os gaps — municípios da UF onde nenhum candidato selecionado tem voto.
            O Excel exportado inclui abas: Resumo, Por candidato, Por município, Por UF, Matriz município×candidato e Gaps.
          </CardDescription>
        </CardHeader>
      </Card>

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
              <Label className="text-xs">UF (define universo de cobertura)</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {(ufs as string[]).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <CandidatoPicker onSelect={adicionar} disabled={chapa.length >= 12} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={limpar} disabled={chapa.length === 0}>
                Limpar chapa
              </Button>
            </div>
          </div>

          {chapa.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded p-4 text-center">
              Adicione candidatos para começar a simular a chapa (até 12).
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {chapa.map((c, i) => (
                <div key={i} className="flex items-center gap-2 border rounded-full pl-3 pr-1 py-1 text-sm" style={{ borderColor: PALETTE[i % PALETTE.length] }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
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

      {chapa.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Vote className="w-3 h-3" /> Votos totais</div>
              <div className="text-2xl font-bold tabular-nums">{fmt(totalChapa)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">2022: {fmt(total2022)} · 2024: {fmt(total2024)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Cobertura</div>
              <div className="text-2xl font-bold tabular-nums">{fmt(cobertura)}<span className="text-sm text-muted-foreground"> / {fmt(universoCount)}</span></div>
              <div className="text-[11px] text-muted-foreground mt-1">{pctCobertura.toFixed(1)}% dos municípios da UF</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" /> Sobreposição</div>
              <div className="text-2xl font-bold tabular-nums">{fmt(sobreposicao)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">cidades com &gt;1 candidato · {fmt(exclusivos)} exclusivas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" /> Gaps</div>
              <div className="text-2xl font-bold tabular-nums">{fmt(gaps.length)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">municípios sem cobertura na UF</div>
            </CardContent>
          </Card>
        </div>
      )}

      {chapa.length > 0 && uf !== "__all__" && universoMunicipios.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Mapa de calor — cobertura em {uf}
            </CardTitle>
            <CardDescription className="text-xs">
              Cada célula é um município de {uf}. Cor mais intensa = mais votos da chapa. Células
              vermelhas tracejadas indicam <strong>gaps</strong> (sem cobertura). Passe o mouse para detalhes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const cobertosMap = new Map(porMunicipio.map((m) => [m.municipio, m]));
              const universoOrdenado = [...universoMunicipios].sort((a, b) =>
                a.municipio.localeCompare(b.municipio, "pt-BR")
              );
              const maxVotos = Math.max(1, ...porMunicipio.map((m) => m.total));
              const intensity = (v: number) => {
                if (v <= 0) return 0;
                // escala raiz quadrada para realçar diferenças nas pontas
                return Math.min(1, Math.sqrt(v / maxVotos));
              };
              const cobertosCount = porMunicipio.filter((m) => m.uf === uf).length;
              const totalUF = universoOrdenado.length;
              const gapsUF = totalUF - cobertosCount;
              return (
                <>
                  {/* Legenda */}
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Intensidade:</span>
                      <div className="flex items-center gap-0.5">
                        {[0.15, 0.3, 0.5, 0.7, 0.9, 1].map((a, i) => (
                          <div
                            key={i}
                            className="w-5 h-3 rounded-sm border border-border/50"
                            style={{ background: `hsl(var(--primary) / ${a})` }}
                          />
                        ))}
                      </div>
                      <span className="text-muted-foreground">+ votos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm border border-dashed border-destructive bg-destructive/10" />
                      <span className="text-muted-foreground">Gap (sem cobertura)</span>
                    </div>
                    <div className="ml-auto flex items-center gap-3 text-muted-foreground">
                      <span><span className="font-semibold text-foreground">{fmt(cobertosCount)}</span> cobertos</span>
                      <span className="text-destructive"><span className="font-semibold">{fmt(gapsUF)}</span> gaps</span>
                      <span><span className="font-semibold text-foreground">{totalUF > 0 ? ((cobertosCount / totalUF) * 100).toFixed(1) : 0}%</span> cobertura</span>
                    </div>
                  </div>

                  {/* Grid de células */}
                  <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                    {universoOrdenado.map((u) => {
                      const dados = cobertosMap.get(u.municipio);
                      const votos = dados?.total || 0;
                      const presentes = dados?.presentes || 0;
                      const isGap = !dados || votos === 0;
                      const alpha = intensity(votos);
                      const presentesNomes = chapa
                        .map((c) => {
                          const k = `${c.nome}__${c.partido || ""}`;
                          return { nome: c.nome, votos: dados?.porCand[k] || 0 };
                        })
                        .filter((x) => x.votos > 0)
                        .sort((a, b) => b.votos - a.votos);
                      const tooltip = isGap
                        ? `${u.municipio}\nGap — nenhum candidato da chapa pontua aqui`
                        : `${u.municipio}\n${fmt(votos)} votos · ${presentes} candidato(s)\n${presentesNomes
                            .slice(0, 5)
                            .map((p) => `• ${p.nome}: ${fmt(p.votos)}`)
                            .join("\n")}`;
                      return (
                        <div
                          key={u.municipio}
                          title={tooltip}
                          className={`relative h-12 rounded-sm border text-[10px] px-1.5 py-1 overflow-hidden cursor-default transition-transform hover:scale-105 hover:z-10 hover:shadow-md ${
                            isGap
                              ? "border-dashed border-destructive/60 bg-destructive/10"
                              : "border-border/50"
                          }`}
                          style={
                            isGap
                              ? undefined
                              : { background: `hsl(var(--primary) / ${alpha})` }
                          }
                        >
                          <div
                            className={`font-medium truncate leading-tight ${
                              isGap
                                ? "text-destructive"
                                : alpha > 0.55
                                ? "text-primary-foreground"
                                : "text-foreground"
                            }`}
                          >
                            {u.municipio}
                          </div>
                          <div
                            className={`tabular-nums leading-tight ${
                              isGap
                                ? "text-destructive/70"
                                : alpha > 0.55
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground"
                            }`}
                          >
                            {isGap ? "sem voto" : fmt(votos)}
                          </div>
                          {!isGap && presentes > 1 && (
                            <div
                              className={`absolute top-0.5 right-1 text-[9px] font-bold ${
                                alpha > 0.55 ? "text-primary-foreground" : "text-foreground/70"
                              }`}
                            >
                              {presentes}×
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {chapa.length > 0 && uf === "__all__" && (
        <Card className="border-dashed">
          <CardContent className="p-4 text-xs text-muted-foreground text-center">
            Selecione uma UF específica acima para visualizar o mapa de calor de municípios e gaps.
          </CardContent>
        </Card>
      )}

      {chapa.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Contribuição de cada candidato</CardTitle>
              <CardDescription className="text-xs">Quanto cada um soma de votos e quantos municípios alcança individualmente.</CardDescription>
            </div>
            <Button onClick={exportar} variant="outline" size="sm" disabled={porMunicipio.length === 0}>
              <Download className="w-4 h-4 mr-2" /> Excel completo (6 abas)
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Partido</TableHead>
                  <TableHead className="text-right">2022</TableHead>
                  <TableHead className="text-right">2024</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Municípios</TableHead>
                  <TableHead className="text-right">% da chapa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porCandidato.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                        {c.nome}
                      </span>
                    </TableCell>
                    <TableCell>{c.partido || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.v2022)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.v2024)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(c.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.municipios)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totalChapa > 0 ? `${((c.total / totalChapa) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {chapa.length > 0 && porUF.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Agregado por UF</CardTitle>
            <CardDescription className="text-xs">
              Distribuição da força da chapa entre estados. Útil quando a busca inclui múltiplas UFs.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UF</TableHead>
                  <TableHead className="text-right">Votos 2022</TableHead>
                  <TableHead className="text-right">Votos 2024</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">% da chapa</TableHead>
                  <TableHead className="text-right">Municípios cobertos</TableHead>
                  <TableHead className="text-right">% cobertura UF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porUF.map((u) => {
                  const universoUF = universoPorUF.get(u.uf) || 0;
                  const pctUF = universoUF > 0 ? (u.municipiosCobertos.size / universoUF) * 100 : 0;
                  return (
                    <TableRow key={u.uf}>
                      <TableCell><Badge variant="outline">{u.uf}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(u.v2022)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(u.v2024)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(u.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {totalChapa > 0 ? `${((u.total / totalChapa) * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(u.municipiosCobertos.size)}{universoUF ? ` / ${fmt(universoUF)}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {universoUF ? `${pctUF.toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {chapa.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cobertura por município</CardTitle>
            <CardDescription className="text-xs">
              Soma de votos da chapa por cidade. "Presentes" indica quantos candidatos têm voto ali.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {chapa.length > 0 && porMunicipio.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Ranking por município — soma da chapa
            </CardTitle>
            <CardDescription className="text-xs">
              Cidades ordenadas pela soma total de votos da chapa. Cada linha lista os candidatos que pontuam ali, com seus respectivos votos.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto divide-y">
              {porMunicipio.slice(0, 100).map((m, idx) => {
                const presentes = chapa
                  .map((c, i) => {
                    const k = `${c.nome}__${c.partido || ""}`;
                    return { ...c, votos: m.porCand[k] || 0, color: PALETTE[i % PALETTE.length] };
                  })
                  .filter((c) => c.votos > 0)
                  .sort((a, b) => b.votos - a.votos);
                const top = presentes[0]?.votos || 1;
                return (
                  <div key={`rk-${m.uf}-${m.municipio}`} className="p-3">
                    <div className="flex items-center justify-between mb-2 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground w-6 text-right">{idx + 1}.</span>
                        <span className="font-semibold truncate">{m.municipio}</span>
                        <Badge variant="outline" className="text-[10px]">{m.uf}</Badge>
                        <Badge variant={presentes.length > 1 ? "default" : "secondary"} className="text-[10px]">
                          {presentes.length} {presentes.length === 1 ? "candidato" : "candidatos"}
                        </Badge>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold tabular-nums">{fmt(m.total)}</div>
                        <div className="text-[10px] text-muted-foreground">votos da chapa</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {presentes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                          <span className="text-xs truncate flex-1 min-w-0">
                            {c.nome}
                            <span className="text-muted-foreground"> · {c.partido || "—"}</span>
                          </span>
                          <div className="flex-1 max-w-[40%] h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(c.votos / top) * 100}%`, background: c.color }}
                            />
                          </div>
                          <span className="text-xs tabular-nums font-medium w-20 text-right">{fmt(c.votos)}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">
                            {m.total > 0 ? `${((c.votos / m.total) * 100).toFixed(0)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {porMunicipio.length > 100 && (
              <div className="text-xs text-muted-foreground p-3 border-t">
                Exibindo os 100 primeiros de {fmt(porMunicipio.length)} municípios. Exporte o Excel para ver todos.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {chapa.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhamento por município (matriz)</CardTitle>
            <CardDescription className="text-xs">
              Tabela detalhada com votos por candidato em cada cidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="text-center py-10 text-sm text-muted-foreground">Carregando dados...</div>
            ) : porMunicipio.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Município</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead className="text-center">Presentes</TableHead>
                    {chapa.map((c, i) => (
                      <TableHead key={i} className="text-right">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                          {c.nome.split(" ")[0]}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-semibold">Total chapa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porMunicipio.slice(0, 200).map((m, idx) => (
                    <TableRow key={m.municipio}>
                      <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{m.municipio}</TableCell>
                      <TableCell><Badge variant="outline">{m.uf}</Badge></TableCell>
                      <TableCell className="text-center">
                        <Badge variant={m.presentes > 1 ? "default" : "secondary"}>{m.presentes}</Badge>
                      </TableCell>
                      {chapa.map((c, i) => {
                        const k = `${c.nome}__${c.partido || ""}`;
                        const v = m.porCand[k] || 0;
                        return (
                          <TableCell key={i} className="text-right tabular-nums">
                            {v ? fmt(v) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(m.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {porMunicipio.length > 200 && (
              <div className="text-xs text-muted-foreground p-3 border-t">
                Exibindo os 200 primeiros de {porMunicipio.length} municípios. Exporte o Excel para ver todos.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {chapa.length > 0 && gaps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-destructive" /> Municípios sem cobertura ({fmt(gaps.length)})
            </CardTitle>
            <CardDescription className="text-xs">
              Cidades onde nenhum candidato da chapa registrou votos no período. Oportunidade para reforçar a chapa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
              {gaps.map((m) => (
                <Badge key={`${m.uf}-${m.municipio}`} variant="outline" className="text-xs font-normal">
                  {m.municipio}{uf === "__all__" ? `/${m.uf}` : ""}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CandidatoPicker({ onSelect, disabled }: { onSelect: (c: CandidatoSel) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: candidatos = [], isLoading } = useQuery({
    enabled: open && search.trim().length >= 2,
    queryKey: ["sim-picker", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_chapa_candidates" as any, {
        p_uf: null, p_municipio: null, p_anos: [2022, 2024],
        p_cargos: null, p_partido: null, p_min_votos: 0, p_search: search.trim(),
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
                    onSelect={() => { onSelect({ nome: c.nome_completo, partido: c.partido }); setOpen(false); setSearch(""); }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.nome_completo}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {c.partido || "—"} · {c.cargos} · {c.ufs} · {Number(c.total).toLocaleString("pt-BR")} votos
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