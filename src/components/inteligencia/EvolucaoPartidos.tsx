import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, ArrowRightLeft, Download, Filter } from "lucide-react";
import * as XLSX from "xlsx";

const CARGOS = [
  "Prefeito", "Vereador", "Presidente", "Governador",
  "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital",
];

type EvolucaoRow = {
  partido: string;
  votos_2022: number;
  votos_2024: number;
  candidatos_2022: number;
  candidatos_2024: number;
  municipios_2022: number;
  municipios_2024: number;
  variacao_votos: number;
  variacao_pct: number | null;
};

type MigracaoRow = {
  nome_completo: string;
  partido_2022: string;
  partido_2024: string;
  cargo_2022: string | null;
  cargo_2024: string | null;
  votos_2022: number;
  votos_2024: number;
};

export default function EvolucaoPartidos() {
  const [uf, setUf] = useState<string>("MS");
  const [cargo, setCargo] = useState<string>("__all__");
  const [minVotos, setMinVotos] = useState<string>("100");
  const [search, setSearch] = useState("");

  const { data: ufs = [] } = useQuery({
    queryKey: ["ev-ufs"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_municipios" as any);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((r: any) => r.uf && set.add(r.uf));
      return Array.from(set).sort();
    },
  });

  const { data: evolucao = [], isLoading: loadingEv } = useQuery({
    queryKey: ["partido-evolucao", uf, cargo],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_partido_evolucao" as any, {
        p_uf: uf === "__all__" ? null : uf,
        p_cargo: cargo === "__all__" ? null : cargo,
      });
      if (error) throw error;
      return (data || []) as EvolucaoRow[];
    },
  });

  const { data: migracoes = [], isLoading: loadingMig } = useQuery({
    queryKey: ["partido-migracoes", uf, minVotos],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_migracoes_partidarias" as any, {
        p_uf: uf === "__all__" ? null : uf,
        p_min_votos: Number(minVotos) || 0,
      });
      if (error) throw error;
      return (data || []) as MigracaoRow[];
    },
  });

  const fmt = (n: number) => (n || 0).toLocaleString("pt-BR");

  const evolucaoFiltrada = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return evolucao;
    return evolucao.filter((r) => r.partido.toLowerCase().includes(s));
  }, [evolucao, search]);

  const migracoesFiltradas = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return migracoes;
    return migracoes.filter(
      (r) =>
        r.nome_completo.toLowerCase().includes(s) ||
        r.partido_2022.toLowerCase().includes(s) ||
        r.partido_2024.toLowerCase().includes(s),
    );
  }, [migracoes, search]);

  // Agrega fluxos partido_2022 -> partido_2024 para visão de "para onde foram"
  const fluxos = useMemo(() => {
    const map = new Map<string, { de: string; para: string; pessoas: number; votos_total: number }>();
    migracoes.forEach((m) => {
      const k = `${m.partido_2022}__${m.partido_2024}`;
      const cur = map.get(k) || { de: m.partido_2022, para: m.partido_2024, pessoas: 0, votos_total: 0 };
      cur.pessoas += 1;
      cur.votos_total += (m.votos_2022 || 0) + (m.votos_2024 || 0);
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.votos_total - a.votos_total);
  }, [migracoes]);

  const exportar = () => {
    const wb = XLSX.utils.book_new();
    const sheet1 = evolucaoFiltrada.map((r) => ({
      Partido: r.partido,
      "Votos 2022": r.votos_2022,
      "Votos 2024": r.votos_2024,
      "Variação": r.variacao_votos,
      "Variação %": r.variacao_pct,
      "Candidatos 2022": r.candidatos_2022,
      "Candidatos 2024": r.candidatos_2024,
      "Municípios 2022": r.municipios_2022,
      "Municípios 2024": r.municipios_2024,
    }));
    const sheet2 = migracoesFiltradas.map((m) => ({
      Candidato: m.nome_completo,
      "Partido 2022": m.partido_2022,
      "Partido 2024": m.partido_2024,
      "Cargo 2022": m.cargo_2022,
      "Cargo 2024": m.cargo_2024,
      "Votos 2022": m.votos_2022,
      "Votos 2024": m.votos_2024,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1), "Evolução Partidos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet2), "Migrações");
    XLSX.writeFile(wb, `evolucao_partidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const VarBadge = ({ pct, vot }: { pct: number | null; vot: number }) => {
    if (pct === null) return <Badge variant="outline" className="text-blue-600 border-blue-300">Novo em 2024</Badge>;
    if (vot > 0) return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><TrendingUp className="w-3 h-3 mr-1" />+{pct.toFixed(1)}%</Badge>;
    if (vot < 0) return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100"><TrendingDown className="w-3 h-3 mr-1" />{pct.toFixed(1)}%</Badge>;
    return <Badge variant="outline">0%</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowRightLeft className="w-5 h-5 text-primary" /> Evolução de Partidos & Migrações
          </CardTitle>
          <CardDescription>
            Compare o desempenho de cada partido entre <strong>2022 e 2024</strong> e identifique candidatos que <strong>trocaram de legenda</strong>. Útil para entender o crescimento/encolhimento de partidos e mapear lideranças em transição.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <Label className="text-xs">Cargo (somente partidos)</Label>
            <Select value={cargo} onValueChange={setCargo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mín. votos (migrações)</Label>
            <Input type="number" min={0} value={minVotos} onChange={(e) => setMinVotos(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Buscar (partido ou candidato)</Label>
            <Input placeholder="Ex: PSDB, MOCHI..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          <strong>{evolucaoFiltrada.length}</strong> partido(s) · <strong>{migracoesFiltradas.length}</strong> candidato(s) trocaram de legenda
        </div>
        <Button onClick={exportar} variant="outline" size="sm" disabled={evolucao.length === 0}>
          <Download className="w-4 h-4 mr-2" /> Exportar Excel
        </Button>
      </div>

      {/* Ranking de Partidos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ranking de Partidos — 2022 vs 2024</CardTitle>
          <CardDescription className="text-xs">
            Variação % calculada sobre os votos totais de 2022. Partidos sem votos em 2022 aparecem como "Novo em 2024".
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loadingEv ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Partido</TableHead>
                  <TableHead className="text-right">Votos 2022</TableHead>
                  <TableHead className="text-right">Votos 2024</TableHead>
                  <TableHead className="text-right">Variação</TableHead>
                  <TableHead className="text-right">Cand. 22→24</TableHead>
                  <TableHead className="text-right">Munic. 22→24</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evolucaoFiltrada.slice(0, 200).map((r, i) => (
                  <TableRow key={r.partido}>
                    <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                    <TableCell><Badge variant="outline" className="font-medium">{r.partido}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.votos_2022 ? fmt(r.votos_2022) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.votos_2024 ? fmt(r.votos_2024) : "—"}</TableCell>
                    <TableCell className="text-right"><VarBadge pct={r.variacao_pct} vot={r.variacao_votos} /></TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {r.candidatos_2022} → {r.candidatos_2024}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {r.municipios_2022} → {r.municipios_2024}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Fluxos resumidos */}
      {fluxos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Principais fluxos entre legendas</CardTitle>
            <CardDescription className="text-xs">
              Resumo dos movimentos mais relevantes entre 2022 e 2024 (agrupado por origem → destino).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>De (2022)</TableHead>
                  <TableHead className="w-12 text-center">→</TableHead>
                  <TableHead>Para (2024)</TableHead>
                  <TableHead className="text-right">Candidatos</TableHead>
                  <TableHead className="text-right">Votos somados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fluxos.slice(0, 30).map((f, i) => (
                  <TableRow key={i}>
                    <TableCell><Badge variant="outline">{f.de}</Badge></TableCell>
                    <TableCell className="text-center text-muted-foreground"><ArrowRightLeft className="w-3.5 h-3.5 inline" /></TableCell>
                    <TableCell><Badge variant="outline">{f.para}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{f.pessoas}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(f.votos_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Migrações detalhadas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Candidatos que mudaram de legenda</CardTitle>
          <CardDescription className="text-xs">
            Detecção por nome completo (igualdade case-insensitive sem acentos). Pode haver homônimos — confira contexto/cargo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loadingMig ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
          ) : migracoesFiltradas.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Nenhuma migração detectada com os filtros atuais.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Partido 2022</TableHead>
                  <TableHead className="w-12 text-center">→</TableHead>
                  <TableHead>Partido 2024</TableHead>
                  <TableHead>Cargo 2022 → 2024</TableHead>
                  <TableHead className="text-right">Votos 2022</TableHead>
                  <TableHead className="text-right">Votos 2024</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {migracoesFiltradas.slice(0, 500).map((m, i) => (
                  <TableRow key={`${m.nome_completo}-${i}`}>
                    <TableCell className="font-medium">{m.nome_completo}</TableCell>
                    <TableCell><Badge variant="outline" className="bg-amber-50">{m.partido_2022}</Badge></TableCell>
                    <TableCell className="text-center text-muted-foreground"><ArrowRightLeft className="w-3.5 h-3.5 inline" /></TableCell>
                    <TableCell><Badge variant="outline" className="bg-emerald-50">{m.partido_2024}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.cargo_2022 || "—"} → {m.cargo_2024 || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(m.votos_2022)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(m.votos_2024)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {migracoesFiltradas.length > 500 && (
            <div className="text-xs text-muted-foreground p-3 border-t">
              Exibindo as 500 primeiras de {migracoesFiltradas.length} migrações. Refine os filtros ou exporte para Excel.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}