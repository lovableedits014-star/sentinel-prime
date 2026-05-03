import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Loader2, Copy, ThumbsUp, ThumbsDown, Wand2, Brain, Flame, HelpCircle, AlertTriangle, Heart, TrendingUp, TrendingDown, Minus, Calendar, Users, Siren, Zap, Telescope, FileAudio, Upload, Download, Trash2, Pencil, Megaphone, Hash, Database, FileText } from "lucide-react";
import { MemoriaPanel } from "@/components/inteligencia-conteudo/MemoriaPanel";
import { MateriasPanel } from "@/components/inteligencia-conteudo/MateriasPanel";
import { toast } from "sonner";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { useIdeias, useUpdateIdeaStatus, useCreateIdea } from "@/hooks/ic/useIdeias";
import { groupSegments, blocksToSrt, blocksToVtt, blocksToPlainText, downloadTextFile, type RawSegment, type SrtBlock, formatSrtTime } from "@/lib/srt";

const FUNC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function invoke(fn: string, body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FUNC_BASE}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Falha (${res.status})`);
  return json;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copiado");
}

export default function InteligenciaConteudo() {
  const { data: clientId } = useCurrentClientId();
  const [tab, setTab] = useState("radar");

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Inteligência de Conteúdo</h1>
            <p className="text-sm text-muted-foreground">
              Co-piloto consultivo: ideias, textos e projeções com base nos seus dados. Você decide e produz manualmente.
            </p>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-7 w-full max-w-4xl">
          <TabsTrigger value="radar"><Flame className="w-4 h-4 mr-1.5" />Radar</TabsTrigger>
          <TabsTrigger value="ideias"><Sparkles className="w-4 h-4 mr-1.5" />Ideias</TabsTrigger>
          <TabsTrigger value="estudio"><Wand2 className="w-4 h-4 mr-1.5" />Estúdio</TabsTrigger>
          <TabsTrigger value="dna"><Brain className="w-4 h-4 mr-1.5" />DNA</TabsTrigger>
          <TabsTrigger value="transcricao"><FileAudio className="w-4 h-4 mr-1.5" />Transcrição</TabsTrigger>
          <TabsTrigger value="memoria"><Database className="w-4 h-4 mr-1.5" />Memória</TabsTrigger>
          <TabsTrigger value="materias"><FileText className="w-4 h-4 mr-1.5" />Matérias</TabsTrigger>
        </TabsList>

        <TabsContent value="radar" className="mt-4">
          <RadarPanel clientId={clientId} onSeed={() => setTab("ideias")} />
        </TabsContent>
        <TabsContent value="ideias" className="mt-4">
          <IdeiasPanel clientId={clientId} onOpen={() => setTab("estudio")} />
        </TabsContent>
        <TabsContent value="estudio" className="mt-4">
          <EstudioPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="dna" className="mt-4">
          <DnaPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="transcricao" className="mt-4">
          <TranscricaoPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="memoria" className="mt-4">
          <MemoriaPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="materias" className="mt-4">
          {clientId && <MateriasPanel clientId={clientId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Radar ---------- */
function RadarPanel({ clientId, onSeed }: { clientId: string | null | undefined; onSeed: () => void }) {
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["ic-radar", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      return invoke("ic-radar", { clientId });
    },
    enabled: !!clientId,
    staleTime: Infinity,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: async () => invoke("ic-radar", { clientId, force: true }),
    onSuccess: () => { toast.success("Radar atualizado"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar radar"),
  });

  const deepScan = useMutation({
    mutationFn: async () => invoke("ic-radar", { clientId, force: true, deep: true }),
    onSuccess: () => { toast.success("Análise profunda concluída"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Falha na análise profunda"),
  });

  const create = useCreateIdea();
  async function saveAsIdea(titulo: string, descricao: string, tema: string, tipo: string) {
    if (!clientId) return;
    await create.mutateAsync({ client_id: clientId, titulo, descricao, tema, tipo, origem: "radar", score: 70 });
    toast.success("Salva no Banco de Ideias");
    onSeed();
  }

  if (!clientId) return <Card><CardContent className="py-10 text-center text-muted-foreground">Carregando…</CardContent></Card>;
  if (isLoading) return <Card><CardContent className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></CardContent></Card>;
  if (error) return (
    <Card>
      <CardContent className="py-8 text-center space-y-3">
        <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
        <p className="text-sm text-muted-foreground">Não foi possível gerar o radar agora.</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{(error as Error).message}</p>
        <Button size="sm" variant="outline" onClick={() => refresh.mutate()}>
          <RefreshCw className="w-4 h-4 mr-2" />Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );

  const snap = data?.snapshot;
  const meta = snap?.meta ?? {};
  const v = meta.variation ?? {};

  return (
    <div className="space-y-4">
      {/* Cabeçalho com KPIs da semana */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge variant="outline">
                {snap?.snapshot_date ? `Snapshot ${snap.snapshot_date}` : "Sem snapshot"}{data?.cached ? " (cache)" : ""}
              </Badge>
              <span className="text-muted-foreground">Janela: {meta.window_days ?? 7} dias</span>
              <span className="text-muted-foreground">·</span>
              <KpiPill label="Comentários" value={meta.curr_window?.total ?? 0} variation={v.total} />
              <KpiPill label="Negativos" value={meta.curr_window?.neg ?? 0} variation={v.neg} invertColor />
              <KpiPill label="Positivos" value={meta.curr_window?.pos ?? 0} variation={v.pos} />
              {meta.defenders_count > 0 && <Badge variant="secondary" className="text-[10px]">🔥 {meta.defenders_count} defensores</Badge>}
              {meta.haters_count > 0 && <Badge variant="destructive" className="text-[10px]">⚔️ {meta.haters_count} críticos</Badge>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending || deepScan.isPending}>
                {refresh.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="ml-2">Atualizar</span>
              </Button>
              <Button size="sm" onClick={() => deepScan.mutate()} disabled={deepScan.isPending || refresh.isPending}>
                {deepScan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Telescope className="w-4 h-4" />}
                <span className="ml-2">Análise profunda (14d)</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CRISES (no topo, urgência) */}
      {(snap?.crisis_alerts?.length ?? 0) > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Siren className="w-4 h-4" />Apagar incêndio agora
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {snap.crisis_alerts.slice(0, 5).map((a: any, i: number) => (
                <li key={i} className="border border-destructive/30 rounded-lg p-3 bg-background">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm flex items-center gap-2">
                        {a.urgent && <Badge variant="destructive" className="text-[10px]">URGENTE</Badge>}
                        {a.titulo}
                      </p>
                      {a.descricao && <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => saveAsIdea(`Resposta de crise: ${a.titulo}`, a.descricao ?? "", "crise", "contra-narrativa")}>
                    <Wand2 className="w-3 h-3 mr-1" />Preparar resposta
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* CALENDÁRIO (datas próximas) */}
      {(snap?.calendar_hooks?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Calendar className="w-4 h-4 text-purple-500" />Datas que pedem post</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {snap.calendar_hooks.map((h: any, i: number) => (
                <button
                  key={i}
                  onClick={() => saveAsIdea(`Post para ${h.nome}`, `${h.label} (${h.date})`, h.nome, "data-comemorativa")}
                  className="border rounded-lg px-3 py-2 text-left hover:bg-accent transition"
                >
                  <div className="text-xs font-medium">{h.nome}</div>
                  <div className="text-[10px] text-muted-foreground">{h.label} · {h.date}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* GRID PRINCIPAL */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Temas quentes (com score e variação) */}
        <RadarCard
          icon={Flame} iconColor="text-orange-500"
          title="Temas quentes" emptyMsg="Nenhum tema relevante na janela."
          items={snap?.hot_topics ?? []}
          renderItem={(it: any, i: number) => (
            <li key={i} className="border rounded-lg p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium">{it.tema}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {it.volume ?? "?"} menções · sentimento {it.sentimento_predominante ?? "—"}
                    {typeof it.defensor_echo === "number" && ` · 🔥 ${Math.round(it.defensor_echo * 100)}%`}
                  </p>
                </div>
                <ScoreBadge score={it.score} />
              </div>
              {it.exemplos?.[0] && <p className="text-xs italic mt-1 text-muted-foreground line-clamp-2">"{it.exemplos[0]}"</p>}
              <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => saveAsIdea(`Post sobre ${it.tema}`, `${it.volume ?? 0} menções (${it.sentimento_predominante ?? "—"})`, it.tema, "oportunidade")}>
                <Sparkles className="w-3 h-3 mr-1" />Salvar como ideia
              </Button>
            </li>
          )}
        />

        {/* Pulso dos defensores */}
        <RadarCard
          icon={Zap} iconColor="text-amber-500"
          title="Pulso dos defensores 🔥" emptyMsg="Nenhuma pauta sendo puxada pelos seus defensores."
          items={snap?.defender_pulse ?? []}
          renderItem={(it: any, i: number) => (
            <li key={i} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{it.pauta}</p>
              {it.principais_defensores?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Por: {it.principais_defensores.slice(0, 3).join(", ")}
                </p>
              )}
              {it.exemplos?.[0] && <p className="text-xs italic mt-1 text-muted-foreground line-clamp-2">"{it.exemplos[0]}"</p>}
              <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => saveAsIdea(`Amplificar: ${it.pauta}`, `Pauta puxada espontaneamente pelos defensores`, it.pauta, "mobilizacao")}>
                <Sparkles className="w-3 h-3 mr-1" />Amplificar como ideia
              </Button>
            </li>
          )}
        />

        {/* Perguntas em aberto */}
        <RadarCard
          icon={HelpCircle} iconColor="text-blue-500"
          title="Perguntas em aberto" emptyMsg="Sem dúvidas recorrentes."
          items={snap?.open_questions ?? []}
          renderItem={(it: any, i: number) => (
            <li key={i} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{it.pergunta}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Repetida {it.frequencia ?? "?"}x</p>
              {it.exemplos?.[0] && <p className="text-xs italic mt-1 text-muted-foreground line-clamp-2">"{it.exemplos[0]}"</p>}
              <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => saveAsIdea(`Responder: ${it.pergunta}`, `Pergunta repetida ${it.frequencia ?? "?"}x`, "dúvidas", "pergunta")}>
                <Sparkles className="w-3 h-3 mr-1" />Salvar como ideia
              </Button>
            </li>
          )}
        />

        {/* Narrativas hostis */}
        <RadarCard
          icon={AlertTriangle} iconColor="text-destructive"
          title="Narrativas hostis" emptyMsg="Sem narrativas coordenadas detectadas."
          items={snap?.hostile_narratives ?? []}
          renderItem={(it: any, i: number) => (
            <li key={i} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{it.narrativa}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{it.autores_count ?? "?"} autores propagando</p>
              {it.exemplos?.[0] && <p className="text-xs italic mt-1 text-muted-foreground line-clamp-2">"{it.exemplos[0]}"</p>}
              <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => saveAsIdea(`Contra-narrativa: ${it.narrativa}`, `${it.autores_count ?? "?"} autores propagando`, "defesa", "contra-narrativa")}>
                <Sparkles className="w-3 h-3 mr-1" />Salvar como ideia
              </Button>
            </li>
          )}
        />

        {/* Pautas que mobilizam */}
        <RadarCard
          icon={Heart} iconColor="text-pink-500"
          title="Pautas que mobilizam" emptyMsg="Sem pautas mobilizadoras claras."
          items={snap?.mobilizing_pautas ?? []}
          renderItem={(it: any, i: number) => (
            <li key={i} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{it.pauta}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{it.defensores_engajados ?? "?"} defensores engajados</p>
              {it.exemplos?.[0] && <p className="text-xs italic mt-1 text-muted-foreground line-clamp-2">"{it.exemplos[0]}"</p>}
              <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => saveAsIdea(`Mobilizar: ${it.pauta}`, `${it.defensores_engajados ?? "?"} defensores engajados`, it.pauta, "mobilizacao")}>
                <Sparkles className="w-3 h-3 mr-1" />Salvar como ideia
              </Button>
            </li>
          )}
        />

        {/* Sinais da base */}
        <RadarCard
          icon={Users} iconColor="text-emerald-500"
          title="Sinais da base" emptyMsg="Sem movimentação relevante na base."
          items={snap?.base_signals ?? []}
          renderItem={(it: any, i: number) => (
            <li key={i} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{it.titulo}</p>
              {it.detalhe && <p className="text-xs text-muted-foreground mt-0.5">{it.detalhe}</p>}
            </li>
          )}
        />
      </div>
    </div>
  );
}

/* ---------- Componentes auxiliares do Radar ---------- */
function KpiPill({ label, value, variation, invertColor }: { label: string; value: number; variation?: { delta_pct: number; trend: string }; invertColor?: boolean }) {
  const trend = variation?.trend ?? "flat";
  const pct = variation?.delta_pct ?? 0;
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  let color = "text-muted-foreground";
  if (trend === "up") color = invertColor ? "text-destructive" : "text-emerald-600";
  if (trend === "down") color = invertColor ? "text-emerald-600" : "text-muted-foreground";
  if (trend === "new") color = invertColor ? "text-destructive" : "text-emerald-600";
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="font-medium">{label}:</span>
      <span className="font-semibold">{value}</span>
      {variation && trend !== "flat" && (
        <span className={`inline-flex items-center gap-0.5 ${color}`}>
          <Icon className="w-3 h-3" />
          {trend === "new" ? "novo" : `${pct > 0 ? "+" : ""}${pct}%`}
        </span>
      )}
    </span>
  );
}

function ScoreBadge({ score }: { score?: number }) {
  if (typeof score !== "number") return null;
  const tone = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-muted-foreground";
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className={`w-10 h-10 rounded-full ${tone} text-white flex items-center justify-center text-sm font-bold`}>
        {score}
      </div>
      <span className="text-[9px] text-muted-foreground mt-0.5">score</span>
    </div>
  );
}

function RadarCard({ icon: Icon, iconColor, title, emptyMsg, items, renderItem }: {
  icon: any; iconColor: string; title: string; emptyMsg: string;
  items: any[]; renderItem: (it: any, i: number) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Icon className={`w-4 h-4 ${iconColor}`} />{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{emptyMsg}</p>
        ) : (
          <ul className="space-y-2">{items.slice(0, 5).map(renderItem)}</ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Ideias ---------- */
function IdeiasPanel({ clientId, onOpen }: { clientId: string | null | undefined; onOpen: () => void }) {
  const [filterStatus, setFilterStatus] = useState<string>("pendente");
  const { data: ideas = [], isLoading, refetch } = useIdeias(clientId, filterStatus === "all" ? undefined : filterStatus);
  const update = useUpdateIdeaStatus();

  const generateDaily = useMutation({
    mutationFn: async () => invoke("ic-daily-ideas", { clientId }),
    onSuccess: () => { toast.success("Novas ideias geradas"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {["pendente", "aprovada", "descartada", "all"].map((s) => (
            <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"} onClick={() => setFilterStatus(s)}>
              {s === "all" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => generateDaily.mutate()} disabled={generateDaily.isPending}>
          {generateDaily.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span className="ml-2">Gerar 5 novas ideias</span>
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></CardContent></Card>
      ) : ideas.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Nenhuma ideia neste filtro. Use "Gerar 5 novas ideias" ou salve do Radar.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {ideas.map((idea) => (
            <Card key={idea.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm">{idea.titulo}</h3>
                  <Badge variant="outline" className="shrink-0">{idea.score}</Badge>
                </div>
                {idea.descricao && <p className="text-xs text-muted-foreground mb-2">{idea.descricao}</p>}
                <div className="flex flex-wrap gap-1 mb-3">
                  {idea.tema && <Badge variant="secondary" className="text-[10px]">{idea.tema}</Badge>}
                  {idea.tipo && <Badge variant="outline" className="text-[10px]">{idea.tipo}</Badge>}
                  {idea.origem && <Badge variant="outline" className="text-[10px]">{idea.origem}</Badge>}
                </div>
                {idea.status === "pendente" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => update.mutate({ id: idea.id, status: "aprovada" })}>
                      <ThumbsUp className="w-3 h-3 mr-1" />Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => update.mutate({ id: idea.id, status: "descartada" })}>
                      <ThumbsDown className="w-3 h-3 mr-1" />Descartar
                    </Button>
                    <Button size="sm" variant="default" onClick={() => { sessionStorage.setItem("ic-estudio-seed", JSON.stringify({ tema: idea.tema, angulo: idea.titulo })); onOpen(); }}>
                      <Wand2 className="w-3 h-3 mr-1" />Abrir
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Estúdio ---------- */
function EstudioPanel({ clientId }: { clientId: string | null | undefined }) {
  const seed = (() => {
    try { return JSON.parse(sessionStorage.getItem("ic-estudio-seed") ?? "{}"); } catch { return {}; }
  })();
  const [tema, setTema] = useState(seed.tema ?? "");
  const [angulo, setAngulo] = useState(seed.angulo ?? "");
  const [cta, setCta] = useState("");
  const [out, setOut] = useState<any>(null);

  const generate = useMutation({
    mutationFn: async () => invoke("ic-generate-text", { clientId, tema, angulo, cta }),
    onSuccess: (r) => { setOut(r.generated); toast.success("Conteúdo gerado"); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Briefing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium">Tema *</label>
            <Input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: saúde pública" />
          </div>
          <div>
            <label className="text-xs font-medium">Ângulo</label>
            <Input value={angulo} onChange={(e) => setAngulo(e.target.value)} placeholder="Ex: nova UPA no bairro X" />
          </div>
          <div>
            <label className="text-xs font-medium">CTA</label>
            <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex: compartilhe se concorda" />
          </div>
          <Button className="w-full" onClick={() => generate.mutate()} disabled={!tema || generate.isPending}>
            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Gerar variantes
          </Button>
          <p className="text-[11px] text-muted-foreground">A ferramenta apenas sugere. Você publica manualmente onde quiser.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sugestões</CardTitle></CardHeader>
        <CardContent>
          {!out ? (
            <p className="text-sm text-muted-foreground text-center py-10">Preencha o briefing e clique em Gerar.</p>
          ) : (
            <div className="space-y-4">
              {(["facebook", "instagram", "roteiro_falado", "brief_visual", "resposta_padrao"] as const).map((k) => out[k] && (
                <div key={k} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.replace("_", " ")}</p>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => copyText(out[k])}><Copy className="w-3 h-3 mr-1" />Copiar</Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{out[k]}</p>
                  {k === "instagram" && out.hashtags?.length > 0 && (
                    <p className="text-xs text-primary mt-2">{out.hashtags.map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- DNA ---------- */
function DnaPanel({ clientId }: { clientId: string | null | undefined }) {
  const { data: dna, isLoading, refetch } = useQuery({
    queryKey: ["ic-dna", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data } = await (supabase as any).from("content_dna").select("*").eq("client_id", clientId).maybeSingle();
      return data;
    },
    enabled: !!clientId,
    staleTime: Infinity,
  });

  const recalibrar = useMutation({
    mutationFn: async () => invoke("ic-dna-analyzer", { clientId }),
    onSuccess: () => { toast.success("DNA recalibrado"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  if (isLoading) return <Card><CardContent className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">DNA Editorial</CardTitle>
          <Button size="sm" onClick={() => recalibrar.mutate()} disabled={recalibrar.isPending}>
            {recalibrar.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Recalibrar (analisa últimos 90d)
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!dna ? (
          <p className="text-sm text-muted-foreground text-center py-8">DNA ainda não calibrado. Clique em "Recalibrar" para analisar seus posts próprios.</p>
        ) : (
          <DnaContent dna={dna} />
        )}
      </CardContent>
    </Card>
  );
}

function DnaContent({ dna }: { dna: any }) {
  const vocab: string[] = Array.from(
    new Map<string, string>(
      (dna.vocabulario ?? [])
        .filter((v: any) => typeof v === "string" && v.trim())
        .map((v: string) => [v.trim().toLowerCase(), v.trim()])
    ).values()
  );

  const tamanho = (dna.tamanho_ideal ?? {}) as Record<string, number>;
  const estruturas = (dna.estruturas ?? {}) as Record<string, number>;
  const horarios = (dna.horarios_pico ?? {}) as Record<string, number[]>;

  const estruturaLabels: Record<string, string> = {
    pergunta_retorica: "Pergunta retórica",
    dado_emocao: "Dado + emoção",
    storytelling: "Storytelling",
    lista: "Lista",
    cta_direto: "CTA direto",
  };

  const diasOrdem = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const diasLabels: Record<string, string> = {
    seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom",
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Tom</div>
          <div className="capitalize">{dna.tom ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Amostra</div>
          <div>{dna.sample_size} posts</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2">Vocabulário recorrente</div>
        {vocab.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {vocab.map((v) => <Badge key={v} variant="secondary">{v}</Badge>)}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Emojis assinatura</div>
          <div className="text-2xl leading-relaxed">
            {(dna.emojis_assinatura ?? []).join(" ") || "—"}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">Tamanho ideal (caracteres)</div>
          <div className="flex gap-4">
            {Object.entries(tamanho).map(([plat, size]) => (
              <div key={plat} className="flex flex-col">
                <span className="text-xs text-muted-foreground capitalize">{plat}</span>
                <span className="font-semibold">{size}</span>
              </div>
            ))}
            {Object.keys(tamanho).length === 0 && <span className="text-muted-foreground">—</span>}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2">Estruturas mais usadas</div>
        {Object.keys(estruturas).length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(estruturas)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .map(([key, val]) => {
                const pct = Math.round((val as number) * 100);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-32 text-xs">{estruturaLabels[key] ?? key}</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs tabular-nums w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2">Horários de pico</div>
        {Object.keys(horarios).length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {diasOrdem
              .filter((d) => horarios[d]?.length)
              .map((d) => (
                <div key={d} className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted">
                  <span className="text-xs font-semibold">{diasLabels[d]}</span>
                  <span className="text-xs text-muted-foreground">
                    {horarios[d].map((h) => `${String(h).padStart(2, "0")}h`).join(" · ")}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Transcrição (áudio/vídeo → SRT) ---------- */
const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

function TranscricaoPanel({ clientId }: { clientId: string | null | undefined }) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<string>("pt");
  const [maxWords, setMaxWords] = useState<number>(5);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["ic-transcriptions", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("ic_transcriptions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
    staleTime: Infinity,
  });

  async function handleUpload() {
    if (!file || !clientId) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Máximo 25MB. Exporte só o áudio (MP3/M4A) do Premiere.");
      return;
    }
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("file", file);
      form.append("clientId", clientId);
      if (language) form.append("language", language);
      const res = await fetch(`${FUNC_URL}/ic-transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Falha (${res.status})`);
      toast.success("Transcrição concluída");
      setFile(null);
      setActiveId(json.transcription.id);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao transcrever");
    } finally {
      setUploading(false);
    }
  }

  const active = (list.data ?? []).find((t: any) => t.id === activeId) ?? (list.data?.[0] as any);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileAudio className="w-4 h-4 text-primary" />
            Transcrever áudio/vídeo → legenda SRT
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Suba um arquivo de áudio (MP3, M4A, WAV) ou vídeo curto. Use Whisper Large v3 da Groq via sua chave configurada.
            <br />
            <strong>Dica:</strong> exporte só o áudio do Premiere (Arquivo &gt; Exportar &gt; Mídia &gt; Formato MP3) — limite 25MB.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Arquivo</label>
              <Input
                key={file?.name ?? "empty"}
                type="file"
                accept="audio/*,video/mp4,video/quicktime,.mp3,.m4a,.wav,.aac,.mp4,.mov,.webm,.ogg"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Idioma</label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt" className="w-20" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground" title="Quantas palavras no máximo por legenda. 3-5 = estilo Reels/TikTok rápido.">Palavras por bloco</label>
              <Input type="number" min={1} max={30} value={maxWords} onChange={(e) => setMaxWords(Math.max(1, Number(e.target.value) || 5))} className="w-24" />
            </div>
            <Button onClick={handleUpload} disabled={!file || uploading || !clientId}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="ml-2">Transcrever</span>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            💡 <strong>3 palavras</strong> = legendas curtinhas (Reels). <strong>5-7 palavras</strong> = ritmo equilibrado. <strong>10+ palavras</strong> = estilo palestra. Você pode mudar e os blocos atualizam na hora — sem re-transcrever.
          </p>
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} · {(file.size / (1024 * 1024)).toFixed(1)}MB
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[600px] overflow-auto">
            {list.isLoading && <Loader2 className="w-4 h-4 animate-spin mx-auto my-4" />}
            {(list.data ?? []).length === 0 && !list.isLoading && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma transcrição ainda.</p>
            )}
            {(list.data ?? []).map((t: any) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left p-2 rounded-md border text-xs transition ${
                  active?.id === t.id ? "bg-accent border-primary" : "hover:bg-accent"
                }`}
              >
                <div className="font-medium truncate">{t.filename}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t.duration_sec ? `${Math.round(t.duration_sec)}s · ` : ""}
                  {new Date(t.created_at).toLocaleString("pt-BR")}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {active ? (
          <TranscriptionEditor
            key={active.id}
            transcription={active}
            maxWords={maxWords}
            onDeleted={() => {
              setActiveId(null);
              list.refetch();
            }}
            onSaved={() => list.refetch()}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Faça upload ou selecione uma transcrição.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function TranscriptionEditor({
  transcription,
  maxWords,
  onDeleted,
  onSaved,
}: {
  transcription: any;
  maxWords: number;
  onDeleted: () => void;
  onSaved: () => void;
}) {
  const initialBlocks = React.useMemo(
    () => groupSegments(transcription.segments as RawSegment[], { maxWords }),
    [transcription.id, maxWords]
  );
  const [blocks, setBlocks] = useState<SrtBlock[]>(initialBlocks);
  React.useEffect(() => setBlocks(initialBlocks), [initialBlocks]);

  function updateText(i: number, text: string) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, text } : b)));
  }

  function download(kind: "srt" | "vtt" | "txt") {
    const base = transcription.filename.replace(/\.[^.]+$/, "");
    if (kind === "srt") downloadTextFile(`${base}.srt`, blocksToSrt(blocks), "application/x-subrip");
    else if (kind === "vtt") downloadTextFile(`${base}.vtt`, blocksToVtt(blocks), "text/vtt");
    else downloadTextFile(`${base}.txt`, blocksToPlainText(blocks), "text/plain");
  }

  async function handleDelete() {
    if (!confirm("Apagar esta transcrição?")) return;
    const { error } = await supabase.from("ic_transcriptions").delete().eq("id", transcription.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Apagada");
      onDeleted();
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-primary" />
              {transcription.filename}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {transcription.language?.toUpperCase() ?? "—"} ·{" "}
              {transcription.duration_sec ? `${Math.round(transcription.duration_sec)}s` : "—"} ·{" "}
              {blocks.length} blocos
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="default" onClick={() => download("srt")}>
              <Download className="w-4 h-4 mr-1.5" />.SRT
            </Button>
            <Button size="sm" variant="outline" onClick={() => download("vtt")}>
              <Download className="w-4 h-4 mr-1.5" />.VTT
            </Button>
            <Button size="sm" variant="outline" onClick={() => download("txt")}>
              <Download className="w-4 h-4 mr-1.5" />.TXT
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyText(blocksToPlainText(blocks))}>
              <Copy className="w-4 h-4 mr-1.5" />Copiar texto
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-auto pr-1">
          {blocks.map((b, i) => (
            <div key={i} className="border rounded-md p-2 flex gap-3 items-start hover:bg-accent/30 transition">
              <div className="text-[10px] text-muted-foreground font-mono shrink-0 w-32 pt-2">
                {formatSrtTime(b.start)}
                <br />
                <span className="text-muted-foreground/70">→ {formatSrtTime(b.end)}</span>
              </div>
              <Textarea
                value={b.text}
                onChange={(e) => updateText(i, e.target.value)}
                rows={2}
                className="text-sm flex-1 min-h-[3rem]"
              />
            </div>
          ))}
        </div>
        <FeedFromTranscriptPanel transcription={transcription} blocks={blocks} />
      </CardContent>
    </Card>
  );
}

/* ---------- Gerador de post de feed a partir da transcrição ---------- */
function FeedFromTranscriptPanel({ transcription, blocks }: { transcription: any; blocks: SrtBlock[] }) {
  const { data: clientId } = useCurrentClientId();
  const [result, setResult] = useState<any>(null);
  const [candidato, setCandidato] = useState<string>("");

  const gen = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Cliente não identificado");
      // Usa o texto editado dos blocos (mais preciso do que o original)
      const transcriptText = blocksToPlainText(blocks);
      return invoke("ic-feed-from-transcript", {
        clientId,
        transcriptionId: transcription.id,
        transcriptText,
        plataforma: "ambos",
      });
    },
    onSuccess: (data) => {
      setResult(data.generated);
      setCandidato(data.candidato || "");
      toast.success("Post gerado");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao gerar post"),
  });

  const fullText = result
    ? `${result.texto}\n\n${(result.hashtags ?? []).join(" ")}`
    : "";

  return (
    <div className="mt-6 border-t pt-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Gerar post pronto para o feed</h3>
        </div>
        <Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>
          {gen.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          <span className="ml-2">{result ? "Gerar de novo" : "Gerar post do feed"}</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Texto único pronto para postar em <strong>Facebook e Instagram</strong>. A IA entende o <strong>contexto</strong> da fala
        (não copia palavra por palavra) e escreve em primeira pessoa como <strong>{candidato || "o candidato cadastrado neste perfil"}</strong>,
        com emojis e hashtags.
      </p>

      {result && (
        <div className="space-y-3">
          {result.resumo_contexto && (
            <div className="text-xs bg-muted/40 border rounded-md p-2">
              <span className="font-medium">📌 Contexto entendido:</span> {result.resumo_contexto}
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
              <Pencil className="w-3 h-3" /> Texto do post (editável)
            </label>
            <Textarea
              value={result.texto}
              onChange={(e) => setResult({ ...result, texto: e.target.value })}
              rows={6}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
              <Hash className="w-3 h-3" /> Hashtags
            </label>
            <Input
              value={(result.hashtags ?? []).join(" ")}
              onChange={(e) =>
                setResult({
                  ...result,
                  hashtags: e.target.value.split(/\s+/).filter(Boolean),
                })
              }
              className="text-sm font-mono"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="default" onClick={() => copyText(fullText)}>
              <Copy className="w-4 h-4 mr-1.5" />Copiar post completo
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyText(result.texto)}>
              <Copy className="w-4 h-4 mr-1.5" />Só o texto
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyText((result.hashtags ?? []).join(" "))}>
              <Copy className="w-4 h-4 mr-1.5" />Só hashtags
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}