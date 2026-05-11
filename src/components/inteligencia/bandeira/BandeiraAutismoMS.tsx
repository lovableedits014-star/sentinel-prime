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
import { RefreshCw, Brain, Users, GraduationCap, Heart, AlertTriangle, Info, Search, FileDown, Baby, UserCog } from "lucide-react";
import jsPDF from "jspdf";

type TeaRow = any; // schema enriquecido — ver migração

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

  const totais = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const sum = (k: string) => rows.reduce((s, r: any) => s + Number(r[k] || 0), 0);
    return {
      pop: sum("populacao"),
      teaMin: sum("est_tea_total_min"),
      teaMax: sum("est_tea_total_max"),
      tea017Min: sum("est_tea_0_17_min"),
      tea017Max: sum("est_tea_0_17_max"),
      teaAdultosMin: sum("est_tea_adultos_min"),
      teaAdultosMax: sum("est_tea_adultos_max"),
      teaMulheresMin: sum("est_tea_mulheres_min"),
      teaMulheresMax: sum("est_tea_mulheres_max"),
      capsi: sum("capsi_qtd"),
      caps: sum("caps_qtd"),
      capsAd: sum("caps_ad_qtd"),
      cer: sum("cer_qtd"),
      ubs: sum("ubs_qtd"),
      municipiosSemCapsi: rows.filter((r: any) => (r.capsi_qtd || 0) === 0).length,
      municipiosSemCaps: rows.filter((r: any) => (r.caps_qtd || 0) === 0).length,
    };
  }, [rows]);

  const top10 = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .sort((a: any, b: any) => (b.est_tea_total_max || 0) - (a.est_tea_total_max || 0))
      .slice(0, 10);
  }, [rows]);

  const semCapsi = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r: any) => (r.capsi_qtd || 0) === 0 && (r.est_tea_0_17_max || 0) > 0)
      .sort((a: any, b: any) => (b.est_tea_0_17_max || 0) - (a.est_tea_0_17_max || 0))
      .slice(0, 15);
  }, [rows]);

  function exportarDossiePDF() {
    if (!rows || rows.length === 0 || !totais) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = margin;
    const newPageIfNeeded = (h = 60) => { if (y > pageH - h) { doc.addPage(); y = margin; } };

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

    // Panorama
    y = 240;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Panorama estadual", margin, y); y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const linhas = [
      `População total: ${fmt(totais.pop)} habitantes`,
      `Estimativa TEA total: entre ${fmt(totais.teaMin)} e ${fmt(totais.teaMax)} (OMS 1% – CDC 2,8%)`,
      `Crianças/adolescentes 0–17 com TEA: ${fmt(totais.tea017Min)} – ${fmt(totais.tea017Max)}`,
      `Adultos 18+ com TEA (invisibilizados): ${fmt(totais.teaAdultosMin)} – ${fmt(totais.teaAdultosMax)}`,
      `Mulheres com TEA estimadas (subdiagnóstico): ${fmt(totais.teaMulheresMin)} – ${fmt(totais.teaMulheresMax)}`,
      `CAPSi (infantojuvenil): ${fmt(totais.capsi)}  |  CAPS totais: ${fmt(totais.caps)}  |  CAPS AD: ${fmt(totais.capsAd)}`,
      `CER (reabilitação): ${fmt(totais.cer)}  |  UBS: ${fmt(totais.ubs)}`,
      `Municípios SEM CAPSi: ${fmt(totais.municipiosSemCapsi)}/${rows.length}  ·  SEM nenhum CAPS: ${fmt(totais.municipiosSemCaps)}`,
    ];
    for (const l of linhas) {
      const wrapped = doc.splitTextToSize(l, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 14;
    }

    // Argumentos
    y += 12;
    newPageIfNeeded(140);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(220, 38, 38);
    doc.text("Argumentos para a bandeira", margin, y); y += 18;
    doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const args = [
      `1. MS tem entre ${fmt(totais.tea017Min)} e ${fmt(totais.tea017Max)} crianças e adolescentes que podem estar dentro do espectro autista — população do tamanho de uma cidade média.`,
      `2. Apenas ${fmt(totais.capsi)} CAPSi atendem todo o estado, e ${fmt(totais.municipiosSemCapsi)} municípios não têm nenhum — vazio assistencial em saúde mental infantil.`,
      `3. Há ainda ${fmt(totais.teaAdultosMin)}–${fmt(totais.teaAdultosMax)} adultos com TEA sem nenhuma política pública específica em MS.`,
      `4. Estimam-se ${fmt(totais.teaMulheresMin)}–${fmt(totais.teaMulheresMax)} mulheres com TEA — historicamente subdiagnosticadas e sem rota clara de atendimento.`,
    ];
    for (const a of args) {
      const wrapped = doc.splitTextToSize(a, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 14 + 6;
    }

    // Top 10
    newPageIfNeeded(220);
    y += 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(15, 23, 42);
    doc.text("Top 10 municípios — maior demanda estimada", margin, y); y += 18;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("Município", margin, y);
    doc.text("Pop.", margin + 170, y);
    doc.text("TEA estim.", margin + 220, y);
    doc.text("0–17", margin + 305, y);
    doc.text("Adultos", margin + 365, y);
    doc.text("CAPSi", margin + 425, y);
    doc.text("CAPS", margin + 460, y);
    doc.text("UBS", margin + 495, y);
    y += 12;
    doc.setDrawColor(226, 232, 240); doc.line(margin, y, pageW - margin, y); y += 8;
    doc.setFont("helvetica", "normal");
    for (const r of top10 as any[]) {
      newPageIfNeeded();
      doc.text(r.nome.slice(0, 22), margin, y);
      doc.text(fmt(r.populacao), margin + 170, y);
      doc.text(`${fmt(r.est_tea_total_min)}–${fmt(r.est_tea_total_max)}`, margin + 220, y);
      doc.text(`${fmt(r.est_tea_0_17_max)}`, margin + 305, y);
      doc.text(`${fmt(r.est_tea_adultos_max)}`, margin + 365, y);
      doc.text(String(r.capsi_qtd ?? 0), margin + 425, y);
      doc.text(String(r.caps_qtd ?? 0), margin + 460, y);
      doc.text(String(r.ubs_qtd ?? 0), margin + 495, y);
      y += 13;
    }

    // Sem CAPSi
    if (semCapsi.length > 0) {
      newPageIfNeeded(160);
      y += 16;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(234, 88, 12);
      doc.text("Prioridade — municípios sem CAPSi", margin, y); y += 18;
      doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      for (const r of semCapsi as any[]) {
        newPageIfNeeded();
        doc.text(`• ${r.nome} — pop. ${fmt(r.populacao)}, est. 0–17 c/ TEA: ${fmt(r.est_tea_0_17_min)}–${fmt(r.est_tea_0_17_max)}, UBS: ${r.ubs_qtd ?? 0}`, margin, y);
        y += 12;
      }
    }

    newPageIfNeeded(80);
    y = pageH - 60;
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text("Fontes: IBGE (população 2025), CNES/DataSUS (CAPS, CER, UBS). Estimativas TEA: OMS 1% (1:100) e CDC 2023 (2,8% / 1:36).", margin, y);
    doc.text("Faixas etárias e razão de gênero (4:1 H:M) baseadas em distribuição IBGE Brasil. Estimativas — não substituem censo.", margin, y + 12);

    doc.save(`dossie-autismo-MS-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("Dossiê PDF gerado");
  }

  return (
    <div className="space-y-5">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs leading-relaxed">
          <strong>Dados enriquecidos:</strong> estimativa TEA por município com recorte de <strong>faixa etária</strong> (0-5, 6-14,
          15-17, 18+), <strong>gênero</strong> (CDC 4:1 H:M, expondo subdiagnóstico feminino), <strong>CAPS por tipo</strong> (I, II, III,
          AD, infantojuvenil), <strong>UBS</strong> e <strong>CER</strong> via CNES, mais <strong>ranking estadual</strong> em cada métrica.
          Estimativas — não substituem censo, mas dão munição quantitativa para a bandeira.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> Coletar / atualizar dados TEA · MS
          </CardTitle>
          <CardDescription className="text-xs">
            Calcula estimativas (faixa etária + gênero) a partir da população IBGE e busca CAPS/UBS/CER via CNES para os 79 municípios. ~30-60s.
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

      {totais && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiBox icon={<Users className="w-3.5 h-3.5" />} label="TEA · MS (total)" value={`${fmt(totais.teaMin)} – ${fmt(totais.teaMax)}`} hint="OMS 1% · CDC 2,8%" />
          <KpiBox icon={<Baby className="w-3.5 h-3.5" />} label="0–17 com TEA" value={`${fmt(totais.tea017Min)} – ${fmt(totais.tea017Max)}`} hint="Público escolar" />
          <KpiBox icon={<UserCog className="w-3.5 h-3.5" />} label="Adultos 18+ TEA" value={`${fmt(totais.teaAdultosMin)} – ${fmt(totais.teaAdultosMax)}`} hint="Invisibilizados" tone="warn" />
          <KpiBox icon={<GraduationCap className="w-3.5 h-3.5" />} label="Mulheres TEA estim." value={`${fmt(totais.teaMulheresMin)} – ${fmt(totais.teaMulheresMax)}`} hint="Subdiagnóstico feminino" />
          <KpiBox icon={<Heart className="w-3.5 h-3.5" />} label="CAPSi no estado" value={String(totais.capsi)} hint={`${totais.caps} CAPS · ${totais.capsAd} AD`} tone={totais.capsi < 5 ? "danger" : "default"} />
          <KpiBox icon={<Heart className="w-3.5 h-3.5" />} label="CER (reabilitação)" value={String(totais.cer)} hint="Atendem TEA" />
          <KpiBox icon={<Heart className="w-3.5 h-3.5" />} label="UBS · MS" value={String(totais.ubs)} hint="Capilaridade" />
          <KpiBox icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Municípios sem CAPSi" value={`${totais.municipiosSemCapsi}/${rows!.length}`} hint="Vazios assistenciais" tone="warn" />
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar município..." className="pl-8" />
      </div>

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
            {filtrados.map((r: any) => <MunicipioTeaCard key={r.id} r={r} />)}
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

function MunicipioTeaCard({ r }: { r: any }) {
  const semCapsi = (r.capsi_qtd || 0) === 0;
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={semCapsi ? "border-amber-500/40" : ""}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap cursor-pointer" onClick={() => setExpanded((x) => !x)}>
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
                  <TooltipContent>Município sem CAPS Infantojuvenil</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {fmt(r.populacao)} hab. {r.populacao_ano ? `(${r.populacao_ano})` : ""} · clique para detalhar
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <Stat label="TEA estim." value={`${fmt(r.est_tea_total_min)} – ${fmt(r.est_tea_total_max)}`} />
            <Stat label="0–17" value={`${fmt(r.est_tea_0_17_max)}`} />
            <Stat label="CAPSi" value={String(r.capsi_qtd ?? 0)} highlight={semCapsi} />
            <Stat label="UBS" value={String(r.ubs_qtd ?? 0)} />
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t grid md:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="font-semibold text-[11px] uppercase text-muted-foreground mb-1.5">Faixas etárias (estim. máx)</div>
              <Row k="0–5 (creche/pré)" v={`${fmt(r.est_tea_0_5_min)}–${fmt(r.est_tea_0_5_max)}`} />
              <Row k="6–14 (fundamental)" v={`${fmt(r.est_tea_6_14_min)}–${fmt(r.est_tea_6_14_max)}`} />
              <Row k="15–17 (médio)" v={`${fmt(r.est_tea_15_17_min)}–${fmt(r.est_tea_15_17_max)}`} />
              <Row k="18+ adultos" v={`${fmt(r.est_tea_adultos_min)}–${fmt(r.est_tea_adultos_max)}`} />
            </div>
            <div>
              <div className="font-semibold text-[11px] uppercase text-muted-foreground mb-1.5">Gênero (CDC 4:1)</div>
              <Row k="Homens" v={`${fmt(r.est_tea_homens_min)}–${fmt(r.est_tea_homens_max)}`} />
              <Row k="Mulheres" v={`${fmt(r.est_tea_mulheres_min)}–${fmt(r.est_tea_mulheres_max)}`} />
              <div className="font-semibold text-[11px] uppercase text-muted-foreground mb-1.5 mt-3">Educação</div>
              <Row k="Matrículas TEA (INEP)" v={fmt(r.matriculas_tea_inep)} />
              <Row k="Cobertura escolar" v={r.pct_cobertura_escolar != null ? `${r.pct_cobertura_escolar}%` : "—"} />
              <Row k="Gap 6–14 fora da escola" v={`${fmt(r.gap_escolar_min)}–${fmt(r.gap_escolar_max)}`} />
            </div>
            <div>
              <div className="font-semibold text-[11px] uppercase text-muted-foreground mb-1.5">Saúde (CNES)</div>
              <Row k="CAPS I / II / III" v={`${r.caps_i_qtd ?? 0} / ${r.caps_ii_qtd ?? 0} / ${r.caps_iii_qtd ?? 0}`} />
              <Row k="CAPS AD / CAPSi" v={`${r.caps_ad_qtd ?? 0} / ${r.capsi_qtd ?? 0}`} highlight={(r.capsi_qtd ?? 0) === 0} />
              <Row k="CER · UBS" v={`${r.cer_qtd ?? 0} · ${r.ubs_qtd ?? 0}`} />
              <Row k="Hab./CAPS" v={fmt(r.hab_por_caps)} />
              <Row k="Tempo diag. estim." v={r.tempo_diag_estimado_meses ? `${r.tempo_diag_estimado_meses} meses` : "—"} />
              <div className="font-semibold text-[11px] uppercase text-muted-foreground mb-1.5 mt-3">Política pública</div>
              <Row k="Lei CIPTEA" v={r.lei_ciptea ? `SIM (${r.lei_ciptea_numero || "—"})` : "—"} />
              <Row k="Centro de referência" v={r.centro_referencia_tea ? "SIM" : "—"} />
              <Row k="BPC deficiência" v={fmt(r.bpc_def_qtd)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 py-0.5 ${highlight ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
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
