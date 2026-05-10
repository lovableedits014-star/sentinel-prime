import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { RefreshCw, Brain, Users, GraduationCap, Heart, AlertTriangle, Info, Search, FileDown, Trophy } from "lucide-react";
import jsPDF from "jspdf";

type TeaRow = {
  id: string;
  codigo_ibge: number;
  nome: string;
  uf: string;
  populacao: number | null;
  populacao_ano: number | null;
  est_tea_total_min: number | null;
  est_tea_total_max: number | null;
  est_tea_0_17_min: number | null;
  est_tea_0_17_max: number | null;
  matriculas_tea_inep: number | null;
  matriculas_tea_ano: number | null;
  capsi_qtd: number | null;
  caps_qtd: number | null;
  hab_por_caps: number | null;
  gap_escolar_min: number | null;
  gap_escolar_max: number | null;
  atualizado_em: string;
  fonte_json: any;
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR");

export default function BandeiraAutismoMS() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["tea-ms-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tea_municipios_ms" as any)
        .select("*")
        .eq("uf", "MS")
        .order("populacao", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as any as TeaRow[]) || [];
    },
  });

  const { data: lastLog } = useQuery({
    queryKey: ["tea-ms-log-last"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tea_sync_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("tea-ms-sync", {
        body: { uf: "MS", fetchCaps: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`${d.municipios_processados} municípios atualizados (${d.caps_coletados} CAPS)`);
      qc.invalidateQueries({ queryKey: ["tea-ms-list"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}. Garanta que rodou antes a coleta IBGE para MS.`),
  });

  const filtrados = useMemo(() => {
    if (!rows) return [];
    if (!busca.trim()) return rows;
    const q = busca.toLowerCase();
    return rows.filter((r) => r.nome.toLowerCase().includes(q));
  }, [rows, busca]);

  // Totais agregados (estado todo)
  const totais = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const sum = (k: keyof TeaRow) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
    return {
      pop: sum("populacao"),
      teaMin: sum("est_tea_total_min"),
      teaMax: sum("est_tea_total_max"),
      tea017Min: sum("est_tea_0_17_min"),
      tea017Max: sum("est_tea_0_17_max"),
      capsi: sum("capsi_qtd"),
      caps: sum("caps_qtd"),
      municipiosSemCapsi: rows.filter((r) => (r.capsi_qtd || 0) === 0).length,
    };
  }, [rows]);

  // Top 10 maiores estimativas (prioridade de campanha)
  const top10 = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .sort((a, b) => (b.est_tea_total_max || 0) - (a.est_tea_total_max || 0))
      .slice(0, 10);
  }, [rows]);

  // Top 10 piores em CAPSi (sem cobertura, ordenado por estimativa)
  const semCapsi = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => (r.capsi_qtd || 0) === 0 && (r.est_tea_0_17_max || 0) > 0)
      .sort((a, b) => (b.est_tea_0_17_max || 0) - (a.est_tea_0_17_max || 0))
      .slice(0, 10);
  }, [rows]);

  function exportarDossiePDF() {
    if (!rows || rows.length === 0 || !totais) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = margin;

    // Capa
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 200, "F");
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 200, pageW, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DOSSIÊ POLÍTICO · BANDEIRA AUTISMO (TEA)", margin, 60);
    doc.setFontSize(28);
    doc.text("Mato Grosso do Sul", margin, 110);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(226, 232, 240);
    doc.text(`${rows.length} municípios analisados · ${new Date().toLocaleDateString("pt-BR")}`, margin, 140);

    // Resumo
    y = 240;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Panorama estadual", margin, y); y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const linhas = [
      `População total considerada: ${fmt(totais.pop)} habitantes`,
      `Estimativa de pessoas com TEA: entre ${fmt(totais.teaMin)} e ${fmt(totais.teaMax)} (faixa OMS 1% – CDC 2,8%)`,
      `Crianças e adolescentes (0–17) com TEA: entre ${fmt(totais.tea017Min)} e ${fmt(totais.tea017Max)}`,
      `CAPS Infantojuvenil (CAPSi) no estado: ${fmt(totais.capsi)}`,
      `CAPS totais (todos tipos): ${fmt(totais.caps)}`,
      `Municípios SEM CAPSi: ${fmt(totais.municipiosSemCapsi)} (de ${rows.length})`,
    ];
    for (const l of linhas) {
      const wrapped = doc.splitTextToSize(l, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 14;
    }

    // Argumentos políticos
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(220, 38, 38);
    doc.text("Argumentos para a bandeira", margin, y); y += 18;
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const args = [
      `1. Mato Grosso do Sul tem entre ${fmt(totais.tea017Min)} e ${fmt(totais.tea017Max)} crianças e adolescentes que podem estar dentro do espectro autista — população do tamanho de uma cidade média do estado.`,
      `2. Apenas ${fmt(totais.capsi)} CAPS Infantojuvenil atendem todo o estado, e ${fmt(totais.municipiosSemCapsi)} municípios não têm nenhum CAPSi — caracterizando vazio assistencial em saúde mental infantil.`,
      `3. A ausência de diagnóstico precoce e de matrícula com apoio especializado é o principal gargalo. Cada município sem CAPSi e sem suporte na rede escolar vira um eixo concreto de proposta.`,
    ];
    for (const a of args) {
      const wrapped = doc.splitTextToSize(a, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 14 + 6;
    }

    // Tabela: top 10 municípios por estimativa
    if (y > pageH - 200) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text("Top 10 municípios — maior demanda estimada", margin, y); y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Município", margin, y);
    doc.text("População", margin + 200, y);
    doc.text("TEA estim.", margin + 290, y);
    doc.text("0–17 estim.", margin + 380, y);
    doc.text("CAPSi", margin + 470, y);
    y += 12;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y); y += 8;
    doc.setFont("helvetica", "normal");
    for (const r of top10) {
      if (y > pageH - 60) { doc.addPage(); y = margin; }
      doc.text(r.nome.slice(0, 28), margin, y);
      doc.text(fmt(r.populacao), margin + 200, y);
      doc.text(`${fmt(r.est_tea_total_min)}–${fmt(r.est_tea_total_max)}`, margin + 290, y);
      doc.text(`${fmt(r.est_tea_0_17_min)}–${fmt(r.est_tea_0_17_max)}`, margin + 380, y);
      doc.text(String(r.capsi_qtd ?? 0), margin + 470, y);
      y += 14;
    }

    // Municípios SEM CAPSi (prioridade)
    if (semCapsi.length > 0) {
      if (y > pageH - 200) { doc.addPage(); y = margin; }
      y += 16;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(234, 88, 12);
      doc.text("Prioridade de campanha — sem CAPSi", margin, y); y += 18;
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const r of semCapsi) {
        if (y > pageH - 60) { doc.addPage(); y = margin; }
        doc.text(`• ${r.nome} — pop. ${fmt(r.populacao)}, est. 0–17 com TEA: ${fmt(r.est_tea_0_17_min)}–${fmt(r.est_tea_0_17_max)}`, margin, y);
        y += 12;
      }
    }

    // Rodapé fontes
    if (y > pageH - 80) { doc.addPage(); y = margin; }
    y = pageH - 60;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Fontes: IBGE (população), CNES/DataSUS (CAPS). Estimativas baseadas em CDC 2023 (1:36) e OMS (1:100).", margin, y);
    doc.text("Estimativas — não substituem censo. Use como base para orientação política e demanda por diagnóstico.", margin, y + 12);

    doc.save(`dossie-autismo-MS-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("Dossiê PDF gerado");
  }

  return (
    <div className="space-y-5">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs leading-relaxed">
          <strong>O que esta aba mostra:</strong> estimativa de pessoas com Transtorno do Espectro Autista (TEA) em cada município
          de MS, cobertura da rede de CAPS (saúde mental) e <strong>lacunas concretas</strong> que viram argumento de campanha.
          As estimativas usam <strong>preval&ecirc;ncia OMS (1%) e CDC 2023 (2,8%)</strong> sobre a população do IBGE — exibidas
          como faixa min–máx para honestidade estatística. <strong>Não é censo.</strong>
        </AlertDescription>
      </Alert>

      {/* Coleta */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> Coletar / atualizar dados TEA · MS
          </CardTitle>
          <CardDescription className="text-xs">
            Calcula estimativas a partir da população IBGE (já coletada em "Contexto Territorial")
            e busca contagem de CAPS via CNES/DataSUS para cada um dos 79 municípios. Roda em ~30s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="gap-1.5">
              <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Coletando..." : "Sincronizar agora"}
            </Button>
            {rows && rows.length > 0 && (
              <Button variant="outline" onClick={exportarDossiePDF} className="gap-1.5">
                <FileDown className="w-4 h-4" /> Exportar dossiê PDF
              </Button>
            )}
            {lastLog && (
              <span className="text-xs text-muted-foreground">
                Última coleta: {new Date(lastLog.created_at).toLocaleString("pt-BR")} ·{" "}
                <span className={lastLog.status === "success" ? "text-emerald-600" : lastLog.status === "partial" ? "text-amber-600" : "text-destructive"}>
                  {lastLog.status} ({lastLog.municipios_processados} municípios)
                </span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Painel agregado */}
      {totais && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiBox icon={<Users className="w-3.5 h-3.5" />} label="Estimativa TEA · MS" value={`${fmt(totais.teaMin)} – ${fmt(totais.teaMax)}`} hint="OMS 1% · CDC 2,8%" />
          <KpiBox icon={<GraduationCap className="w-3.5 h-3.5" />} label="0–17 com TEA" value={`${fmt(totais.tea017Min)} – ${fmt(totais.tea017Max)}`} hint="Público escolar prioritário" />
          <KpiBox icon={<Heart className="w-3.5 h-3.5" />} label="CAPSi no estado" value={String(totais.capsi)} hint={`${totais.caps} CAPS no total`} tone={totais.capsi < 5 ? "danger" : "default"} />
          <KpiBox icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Municípios sem CAPSi" value={`${totais.municipiosSemCapsi}/${rows!.length}`} hint="Vazios assistenciais" tone="warn" />
        </div>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar município..." className="pl-8" />
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !rows || rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum dado TEA carregado ainda.</p>
            <p className="text-xs mt-2">
              1) Vá em "Contexto Territorial (IBGE)" e colete os dados de MS.<br />
              2) Volte aqui e clique em "Sincronizar agora".
            </p>
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="grid gap-2">
            {filtrados.map((r) => <MunicipioTeaCard key={r.id} r={r} />)}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function KpiBox({ icon, label, value, hint, tone = "default" }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "default" | "warn" | "danger" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon} {label}</div>
        <div className={`text-lg font-bold mt-1 ${toneClass}`}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function MunicipioTeaCard({ r }: { r: TeaRow }) {
  const semCapsi = (r.capsi_qtd || 0) === 0;
  return (
    <Card className={semCapsi ? "border-amber-500/40" : ""}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-semibold text-sm flex items-center gap-2">
              {r.nome}
              <span className="text-xs text-muted-foreground font-normal">/ {r.uf}</span>
              {semCapsi && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400 gap-1">
                      <AlertTriangle className="w-2.5 h-2.5" /> Sem CAPSi
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Município sem CAPS Infantojuvenil — vazio assistencial</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {fmt(r.populacao)} hab. {r.populacao_ano ? `(${r.populacao_ano})` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <Stat label="TEA estim." value={`${fmt(r.est_tea_total_min)} – ${fmt(r.est_tea_total_max)}`} />
            <Stat label="0–17 c/ TEA" value={`${fmt(r.est_tea_0_17_min)} – ${fmt(r.est_tea_0_17_max)}`} />
            <Stat label="CAPSi" value={String(r.capsi_qtd ?? 0)} highlight={semCapsi} />
            <Stat label="CAPS" value={String(r.caps_qtd ?? 0)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
    </div>
  );
}
