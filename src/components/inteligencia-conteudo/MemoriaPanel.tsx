import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, Trash2, ExternalLink, Loader2, Search, Sparkles, FileText,
  MapPin, Users, Megaphone, Quote, Hash, Flag, Calendar, FileAudio, BookOpen,
  AlertTriangle, RefreshCw, InstagramIcon, FacebookIcon, MessageSquare, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { toast } from "sonner";
import { exportLivroDeCampanha } from "./exportLivroCampanha";
import { PromessasPanel } from "./PromessasPanel";
import { InsightsCard } from "./InsightsCard";
import { CoberturaPanel } from "./CoberturaPanel";
import { DriftPanel } from "./DriftPanel";
import { IngestDocumentDialog } from "./IngestDocumentDialog";
import { ImportPostsDialog } from "./ImportPostsDialog";
import { usePostsTimeline, type PostTimelineItem } from "./usePostsTimeline";
import { findBestSegment, formatTime, type AudioSegment } from "./audioMatch";
import { useRef, useEffect, createContext, useContext } from "react";
import { Play } from "lucide-react";

const TIPO_LABEL: Record<string, { label: string; color: string }> = {
  promessa: { label: "Promessa", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  proposta: { label: "Proposta", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  bandeira: { label: "Bandeira", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  bairro: { label: "Bairro", color: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  pessoa: { label: "Pessoa", color: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
  adversario: { label: "Adversário", color: "bg-red-500/15 text-red-700 dark:text-red-300" },
  historia: { label: "História", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  bordao: { label: "Bordão", color: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  numero: { label: "Número", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  evento: { label: "Evento", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  dado: { label: "Dado", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  outro: { label: "Outro", color: "bg-muted text-muted-foreground" },
};

export function MemoriaPanel({ clientId, clientName }: { clientId: string | null | undefined; clientName?: string }) {
  const [view, setView] = useState<"documentos" | "promessas" | "cobertura" | "drift" | "timeline" | "contradicoes" | "fatos">("documentos");
  const [exporting, setExporting] = useState(false);
  if (!clientId) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Selecione um cliente.</CardContent></Card>;
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportLivroDeCampanha(clientId!, clientName);
      toast.success("Livro de campanha gerado!");
    } catch (e: any) {
      toast.error(e.message || "Falha ao gerar PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                Memória viva do candidato
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Cada transcrição vira um <strong>documento estruturado</strong> com resumo, propostas, promessas, bordões,
                bairros e pessoas citadas. É a fonte de verdade para o DNA, redator de matérias, sugestões de disparo e o coringa.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
              <IngestDocumentDialog clientId={clientId!} />
              <ImportPostsDialog clientId={clientId!} />
              <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BookOpen className="w-4 h-4 mr-1.5" />}
                Livro de campanha
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <InsightsCard clientId={clientId} />

      <Tabs value={view} onValueChange={(v) => setView(v as any)}>
        <TabsList>
          <TabsTrigger value="documentos"><FileText className="w-4 h-4 mr-1.5" />Documentos</TabsTrigger>
          <TabsTrigger value="promessas"><Flag className="w-4 h-4 mr-1.5" />Promessas</TabsTrigger>
          <TabsTrigger value="cobertura"><MapPin className="w-4 h-4 mr-1.5" />Cobertura</TabsTrigger>
          <TabsTrigger value="drift"><AlertTriangle className="w-4 h-4 mr-1.5" />Drift</TabsTrigger>
          <TabsTrigger value="timeline"><Calendar className="w-4 h-4 mr-1.5" />Timeline</TabsTrigger>
          <TabsTrigger value="contradicoes"><AlertTriangle className="w-4 h-4 mr-1.5" />Contradições</TabsTrigger>
          <TabsTrigger value="fatos"><Sparkles className="w-4 h-4 mr-1.5" />Fatos avulsos</TabsTrigger>
        </TabsList>
        <TabsContent value="documentos" className="mt-4">
          <DocumentsList clientId={clientId} />
        </TabsContent>
        <TabsContent value="promessas" className="mt-4">
          <PromessasPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="cobertura" className="mt-4">
          <CoberturaPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="drift" className="mt-4">
          <DriftPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <DocumentsTimeline clientId={clientId} />
        </TabsContent>
        <TabsContent value="contradicoes" className="mt-4">
          <ContradictionsList clientId={clientId} />
        </TabsContent>
        <TabsContent value="fatos" className="mt-4">
          <FactsList clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* =========================================================================
 * DOCUMENTOS
 * ========================================================================= */

function DocumentsList({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  async function migrateOld() {
    if (!confirm("Reprocessar até 20 transcrições antigas para gerar documentos? Pode levar alguns minutos.")) return;
    setMigrating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ic-migrate-knowledge-to-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ clientId, limit: 20 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha");
      toast.success(`Migração concluída: ${j.processed_now} processadas`);
      qc.invalidateQueries({ queryKey: ["ic-knowledge-documents", clientId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMigrating(false);
    }
  }

  async function runSemanticSearch() {
    if (!search.trim()) {
      setSemanticResults(null);
      return;
    }
    setSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ic-search-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ clientId, query: search, threshold: 0.25, limit: 30 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha na busca");
      setSemanticResults(j.results ?? []);
      if ((j.results ?? []).length === 0) toast.info("Nenhum documento similar encontrado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function backfillEmbeddings() {
    setBackfilling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ic-backfill-embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ clientId, limit: 25 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha");
      toast.success(`Embeddings: ${j.processed} OK, ${j.failed} falhas${j.remaining ? " — clique novamente para continuar" : ""}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBackfilling(false);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["ic-knowledge-documents", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ic_knowledge_documents" as any)
        .select("id, titulo, resumo_executivo, data_evento, created_at, tipo_documento, propostas, promessas, bandeiras, bordoes, bairros_citados, pessoas_citadas, tags, tom_emocional, embedding")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const withoutEmbedding = (data ?? []).filter((d: any) => !d.embedding).length;

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (semanticMode && semanticResults) {
      // Mantém ordem de similaridade vinda do RPC, e enriquece com dados da listagem
      const byId = new Map(list.map((d: any) => [d.id, d]));
      return semanticResults.map((r: any) => ({
        ...(byId.get(r.id) || {}),
        ...r,
        _similarity: r.similarity,
      }));
    }
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter((d) =>
      d.titulo?.toLowerCase().includes(s) ||
      d.resumo_executivo?.toLowerCase().includes(s) ||
      JSON.stringify(d.tags || []).toLowerCase().includes(s),
    );
  }, [data, search, semanticMode, semanticResults]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ic_knowledge_documents" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ic-knowledge-documents", clientId] });
      toast.success("Documento removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={semanticMode ? "Ex: o que ele disse sobre saúde nas periferias..." : "Buscar por título, resumo ou tag..."}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (semanticMode) setSemanticResults(null);
            }}
            onKeyDown={(e) => { if (semanticMode && e.key === "Enter") runSemanticSearch(); }}
            className="pl-9"
          />
        </div>
        <Button
          variant={semanticMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setSemanticMode((v) => !v);
            setSemanticResults(null);
          }}
          title="Busca por significado (embeddings)"
        >
          <Sparkles className="w-4 h-4 mr-1.5" />
          {semanticMode ? "Semântica" : "Literal"}
        </Button>
        {semanticMode && (
          <Button size="sm" onClick={runSemanticSearch} disabled={searching || !search.trim()}>
            {searching ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
            Buscar
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={migrateOld} disabled={migrating}>
          {migrating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          Migrar antigas
        </Button>
      </div>

      {semanticMode && withoutEmbedding > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
          <span className="text-amber-700 dark:text-amber-300">
            {withoutEmbedding} documento(s) ainda sem índice semântico — não aparecerão na busca por significado.
          </span>
          <Button size="sm" variant="outline" onClick={backfillEmbeddings} disabled={backfilling}>
            {backfilling ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            Indexar
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando documentos...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            <FileAudio className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p>{semanticMode && search ? "Nenhum documento similar encontrado." : "Nenhum documento ainda."}</p>
            <p className="text-xs">
              Suba uma transcrição na aba <strong>Transcrição</strong> — a IA cria automaticamente
              um documento estruturado com tudo o que o candidato disse.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((d) => (
            <Card
              key={d.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setOpenId(d.id)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm leading-snug">{d.titulo}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(d.data_evento || d.created_at).toLocaleDateString("pt-BR")}
                      {d.tom_emocional && <span>• tom: {d.tom_emocional}</span>}
                      {typeof d._similarity === "number" && (
                        <Badge variant="secondary" className="text-[10px]">
                          {(d._similarity * 100).toFixed(0)}% similar
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); if (confirm("Remover este documento?")) del.mutate(d.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {d.resumo_executivo && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{d.resumo_executivo}</p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <CountBadge icon={<Megaphone className="w-3 h-3" />} n={d.propostas?.length} label="propostas" />
                  <CountBadge icon={<Flag className="w-3 h-3" />} n={d.promessas?.length} label="promessas" />
                  <CountBadge icon={<Hash className="w-3 h-3" />} n={d.bandeiras?.length} label="bandeiras" />
                  <CountBadge icon={<Quote className="w-3 h-3" />} n={d.bordoes?.length} label="bordões" />
                  <CountBadge icon={<MapPin className="w-3 h-3" />} n={d.bairros_citados?.length} label="bairros" />
                  <CountBadge icon={<Users className="w-3 h-3" />} n={d.pessoas_citadas?.length} label="pessoas" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DocumentDrawer openId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function CountBadge({ icon, n, label }: { icon: React.ReactNode; n?: number; label: string }) {
  if (!n) return null;
  return (
    <Badge variant="secondary" className="text-[10px] gap-1">
      {icon} {n} {label}
    </Badge>
  );
}

/* ---------- Drawer de detalhe ---------- */

/* Player de áudio + contexto para clicar em trechos */
const AudioCtx = createContext<{
  segments: AudioSegment[];
  hasAudio: boolean;
  playAt: (sec: number) => void;
} | null>(null);

function useAudioCtx() { return useContext(AudioCtx); }

function PlaySegmentButton({ text }: { text: string }) {
  const ctx = useAudioCtx();
  if (!ctx?.hasAudio || !ctx.segments.length) return null;
  const seg = findBestSegment(text, ctx.segments);
  if (!seg) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); ctx.playAt(seg.start); }}
      className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:underline"
      title={`Tocar trecho: ${seg.text.slice(0, 80)}...`}
    >
      <Play className="w-3 h-3 fill-current" /> {formatTime(seg.start)}
    </button>
  );
}

function DocumentDrawer({ openId, onClose }: { openId: string | null; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["ic-knowledge-document", openId],
    queryFn: async () => {
      if (!openId) return null;
      const { data, error } = await supabase
        .from("ic_knowledge_documents" as any)
        .select("*")
        .eq("id", openId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!openId,
  });

  // Carrega segmentos da transcrição associada
  const { data: segments = [] } = useQuery({
    queryKey: ["ic-transcription-segments", doc?.transcription_id],
    queryFn: async () => {
      if (!doc?.transcription_id) return [];
      const { data, error } = await supabase
        .from("ic_transcriptions" as any)
        .select("segments")
        .eq("id", doc.transcription_id)
        .maybeSingle();
      if (error) return [];
      return (((data as any)?.segments) ?? []) as AudioSegment[];
    },
    enabled: !!doc?.transcription_id,
  });

  const hasAudio = !!doc?.audio_url;
  const playAt = (sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, sec);
    a.play().catch(() => { /* ignore */ });
  };

  // Reset audio quando muda doc
  useEffect(() => { if (audioRef.current) audioRef.current.pause(); }, [openId]);

  return (
    <Sheet open={!!openId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="text-base pr-8">{doc?.titulo || "Documento"}</SheetTitle>
          {doc && (
            <p className="text-xs text-muted-foreground">
              {new Date(doc.data_evento || doc.created_at).toLocaleString("pt-BR")}
              {doc.tom_emocional && <> • tom: {doc.tom_emocional}</>}
              {doc.provider && <> • {doc.provider}/{doc.model}</>}
            </p>
          )}
          {hasAudio && (
            <audio
              ref={audioRef}
              src={doc.audio_url}
              controls
              preload="metadata"
              className="w-full mt-2 h-9"
            />
          )}
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading || !doc ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <AudioCtx.Provider value={{ segments, hasAudio: hasAudio && segments.length > 0, playAt }}>
            <div className="space-y-5 pb-10">
              {hasAudio && segments.length > 0 && (
                <div className="text-[11px] text-muted-foreground -mt-1 flex items-center gap-1.5">
                  <Play className="w-3 h-3 text-primary" />
                  Clique no horário ao lado de cada item para ouvir o trecho no áudio.
                </div>
              )}
              {hasAudio && segments.length === 0 && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400">
                  Áudio disponível, mas sem segmentação por timestamp para esta transcrição.
                </div>
              )}

              {doc.resumo_executivo && (
                <Section title="Resumo executivo">
                  <p className="text-sm leading-relaxed">{doc.resumo_executivo}</p>
                </Section>
              )}

              {Array.isArray(doc.pontos_principais) && doc.pontos_principais.length > 0 && (
                <Section title="Pontos principais">
                  <ul className="space-y-1.5 text-sm">
                    {doc.pontos_principais.map((p: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <div className="flex-1">
                          <span>{p}</span>
                          <PlaySegmentButton text={p} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <ListSection title="Propostas" items={doc.propostas} render={(p) => (
                <>
                  <p className="font-medium text-sm">{p.titulo}</p>
                  {p.descricao && <p className="text-xs text-muted-foreground mt-0.5">{p.descricao}</p>}
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {p.tema && <Badge variant="outline" className="text-[10px]">{p.tema}</Badge>}
                    {p.bairro && <Badge variant="secondary" className="text-[10px]">📍 {p.bairro}</Badge>}
                    {p.prazo && <Badge variant="outline" className="text-[10px]">⏱ {p.prazo}</Badge>}
                  </div>
                  <PlaySegmentButton text={`${p.titulo || ""} ${p.descricao || ""}`} />
                </>
              )} />

              <ListSection title="Promessas" items={doc.promessas} render={(p) => (
                <>
                  <p className="text-sm">{p.texto}</p>
                  {p.tema && <Badge variant="outline" className="text-[10px] mt-1">{p.tema}</Badge>}
                  <PlaySegmentButton text={p.texto || ""} />
                </>
              )} />

              <ListSection title="Bandeiras" items={doc.bandeiras} render={(b) => (
                <>
                  <p className="text-sm font-medium">{b.tema}</p>
                  {b.posicao && <p className="text-xs text-muted-foreground mt-0.5">{b.posicao}</p>}
                  <PlaySegmentButton text={`${b.tema || ""} ${b.posicao || ""}`} />
                </>
              )} />

              <ListSection title="Bordões" items={doc.bordoes} render={(b) => (
                <>
                  <p className="text-sm italic">"{b.frase}"</p>
                  <PlaySegmentButton text={b.frase || ""} />
                </>
              )} />

              <ListSection title="Bairros citados" items={doc.bairros_citados} render={(b) => (
                <>
                  <p className="text-sm font-medium">📍 {b.nome}</p>
                  {b.contexto && <p className="text-xs text-muted-foreground mt-0.5">{b.contexto}</p>}
                  <PlaySegmentButton text={`${b.nome || ""} ${b.contexto || ""}`} />
                </>
              )} />

              <ListSection title="Pessoas citadas" items={doc.pessoas_citadas} render={(p) => (
                <>
                  <p className="text-sm font-medium">👤 {p.nome} {p.papel && <span className="text-xs text-muted-foreground">— {p.papel}</span>}</p>
                  {p.contexto && <p className="text-xs text-muted-foreground mt-0.5">{p.contexto}</p>}
                  <PlaySegmentButton text={`${p.nome || ""} ${p.contexto || ""}`} />
                </>
              )} />

              <ListSection title="Adversários citados" items={doc.adversarios_citados} render={(a) => (
                <>
                  <p className="text-sm font-medium">{a.nome_ou_referencia} {a.tipo && <span className="text-xs text-muted-foreground">— {a.tipo}</span>}</p>
                  {a.trecho && <p className="text-xs text-muted-foreground italic mt-0.5">"{a.trecho}"</p>}
                  <PlaySegmentButton text={`${a.nome_ou_referencia || ""} ${a.trecho || ""}`} />
                </>
              )} />

              <ListSection title="Números e dados" items={doc.numeros_e_dados} render={(n) => (
                <>
                  <p className="text-sm font-medium">{n.valor}</p>
                  {n.contexto && <p className="text-xs text-muted-foreground mt-0.5">{n.contexto}</p>}
                  <PlaySegmentButton text={`${n.valor || ""} ${n.contexto || ""}`} />
                </>
              )} />

              {doc.texto_integral && (
                <Section title="Transcrição integral">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground mb-2">
                      Ver texto completo ({doc.texto_integral.length.toLocaleString("pt-BR")} caracteres)
                    </summary>
                    {hasAudio && segments.length > 0 ? (
                      <div className="text-xs leading-relaxed bg-muted/50 p-3 rounded space-y-1 max-h-96 overflow-auto">
                        {segments.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => playAt(s.start)}
                            className="block w-full text-left hover:bg-primary/10 rounded px-1.5 py-0.5 transition-colors"
                          >
                            <span className="text-primary font-mono text-[10px] mr-2">{formatTime(s.start)}</span>
                            <span>{s.text}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-xs leading-relaxed bg-muted/50 p-3 rounded">
                        {doc.texto_integral}
                      </p>
                    )}
                  </details>
                </Section>
              )}
            </div>
            </AudioCtx.Provider>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function ListSection<T = any>({
  title, items, render,
}: { title: string; items: T[] | undefined; render: (item: T) => React.ReactNode }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <Section title={`${title} (${items.length})`}>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="border-l-2 border-primary/30 pl-3 py-1">
            {render(it)}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* =========================================================================
 * FATOS (legado — busca livre cross-documento)
 * ========================================================================= */

function FactsList({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-knowledge", clientId, tipoFilter],
    queryFn: async () => {
      let q = supabase
        .from("candidate_knowledge" as any)
        .select("id, tipo, tema, texto, contexto, entidades, source_type, source_url, source_date, confidence, created_at, document_id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (tipoFilter !== "all") q = q.eq("tipo", tipoFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter((r) =>
      r.texto?.toLowerCase().includes(s) ||
      r.tema?.toLowerCase().includes(s) ||
      JSON.stringify(r.entidades || {}).toLowerCase().includes(s),
    );
  }, [data, search]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    (data ?? []).forEach((r) => (m[r.tipo] = (m[r.tipo] || 0) + 1));
    return m;
  }, [data]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidate_knowledge" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-knowledge", clientId] });
      toast.success("Fato removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{data?.length ?? 0} fatos no total</Badge>
        {Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tipo, n]) => (
          <Badge key={tipo} className={TIPO_LABEL[tipo]?.color || ""}>
            {TIPO_LABEL[tipo]?.label || tipo}: {n}
          </Badge>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum fato encontrado.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => {
            const meta = TIPO_LABEL[f.tipo] || TIPO_LABEL.outro;
            const bairros: string[] = Array.isArray(f.entidades?.bairros) ? f.entidades.bairros : [];
            const pessoas: string[] = Array.isArray(f.entidades?.pessoas) ? f.entidades.pessoas : [];
            return (
              <Card key={f.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={meta.color}>{meta.label}</Badge>
                      {f.tema && <Badge variant="outline" className="text-xs">{f.tema}</Badge>}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => del.mutate(f.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm leading-snug">{f.texto}</p>
                  {(bairros.length > 0 || pessoas.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {bairros.map((b) => <Badge key={b} variant="secondary" className="text-[10px]">📍 {b}</Badge>)}
                      {pessoas.slice(0, 3).map((p) => <Badge key={p} variant="secondary" className="text-[10px]">👤 {p}</Badge>)}
                    </div>
                  )}
                  {f.source_url && (
                    <a href={f.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
                      Fonte <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * TIMELINE
 * ========================================================================= */

type TimelineItem =
  | { kind: "doc"; date: string; id: string; doc: any }
  | { kind: "post"; date: string; id: string; post: PostTimelineItem };

function platformIcon(platform: string) {
  if (platform === "instagram") return <InstagramIcon className="w-3.5 h-3.5 text-pink-500" />;
  if (platform === "facebook") return <FacebookIcon className="w-3.5 h-3.5 text-blue-600" />;
  return <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />;
}

function isVideoLike(url: string | null, mediaType: string | null) {
  if (mediaType && /video/i.test(mediaType)) return true;
  if (!url) return false;
  return /\.(mp4|mov|avi|webm|m3u8)/i.test(url) || url.includes("/v/t2/");
}

function DocumentsTimeline({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "todas" | "propostas" | "promessas" | "bandeiras" | "bordoes" | "posts"
  >("todas");

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ["ic-knowledge-documents-timeline", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ic_knowledge_documents" as any)
        .select(
          "id, titulo, resumo_executivo, data_evento, created_at, propostas, promessas, bandeiras, bordoes, bairros_citados, pessoas_citadas, tom_emocional, local, tipo_documento, source_ref"
        )
        .eq("client_id", clientId)
        .order("data_evento", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const { data: posts, isLoading: postsLoading } = usePostsTimeline(clientId);

  // post_ids já promovidos a documento — para evitar duplicar na timeline
  const promotedPostIds = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs ?? []) {
      if (d?.tipo_documento === "post_social" && d?.source_ref) s.add(d.source_ref);
    }
    return s;
  }, [docs]);

  const promoteOne = useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await supabase.functions.invoke("ic-import-posts", {
        body: { clientId, postIds: [postId], limit: 1 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Post enviado à memória.");
      qc.invalidateQueries({ queryKey: ["ic-knowledge-documents-timeline", clientId] });
      qc.invalidateQueries({ queryKey: ["ic-knowledge-documents", clientId] });
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao promover post."),
  });

  // Mescla + filtro + agrupa por mês
  const grouped = useMemo(() => {
    const items: TimelineItem[] = [];

    // documentos
    if (filter !== "posts") {
      for (const d of docs ?? []) {
        // se o filtro for um campo específico, exige array não vazio
        if (filter !== "todas") {
          const arr = (d as any)[filter];
          if (!Array.isArray(arr) || arr.length === 0) continue;
        }
        items.push({
          kind: "doc",
          id: `doc-${d.id}`,
          date: d.data_evento || d.created_at,
          doc: d,
        });
      }
    }

    // posts (apenas em "todas" ou "posts"), e ocultando os já promovidos
    if (filter === "todas" || filter === "posts") {
      for (const p of posts ?? []) {
        if (promotedPostIds.has(p.post_id)) continue;
        if (!p.published_at) continue;
        items.push({
          kind: "post",
          id: `post-${p.post_id}-${p.platform}`,
          date: p.published_at,
          post: p,
        });
      }
    }

    items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const groups = new Map<string, TimelineItem[]>();
    for (const it of items) {
      const dt = new Date(it.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [docs, posts, filter, promotedPostIds]);

  const totalItems = grouped.reduce((acc, [, arr]) => acc + arr.length, 0);

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  const filterChips: Array<{ id: typeof filter; label: string; icon: React.ReactNode }> = [
    { id: "todas", label: "Todas", icon: <FileText className="w-3 h-3" /> },
    { id: "posts", label: "Posts", icon: <InstagramIcon className="w-3 h-3" /> },
    { id: "propostas", label: "Propostas", icon: <Megaphone className="w-3 h-3" /> },
    { id: "promessas", label: "Promessas", icon: <Flag className="w-3 h-3" /> },
    { id: "bandeiras", label: "Bandeiras", icon: <Hash className="w-3 h-3" /> },
    { id: "bordoes", label: "Bordões", icon: <Quote className="w-3 h-3" /> },
  ];

  if (docsLoading || postsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando timeline...
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
          <Calendar className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p>
            {filter === "posts"
              ? "Nenhum post agregado ainda — posts vêm de comentários que o sistema coleta no FacebookIcon/InstagramIcon."
              : "Sem itens nesse filtro."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {filterChips.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={filter === c.id ? "default" : "outline"}
            onClick={() => setFilter(c.id)}
            className="h-7 gap-1.5 text-xs"
          >
            {c.icon} {c.label}
          </Button>
        ))}
      </div>

      <div className="relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

        {grouped.map(([monthKey, items]) => (
          <div key={monthKey} className="mb-6">
            <div className="sticky top-0 z-10 -ml-6 mb-3 flex items-center gap-2 bg-background/95 backdrop-blur py-1.5">
              <div className="w-4 h-4 rounded-full bg-primary border-2 border-background shadow-sm" />
              <h3 className="text-sm font-semibold capitalize">{monthLabel(monthKey)}</h3>
              <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
            </div>

            <div className="space-y-3">
              {items.map((it) => {
                const dt = new Date(it.date);
                const day = dt.getDate();
                return (
                  <div key={it.id} className="relative flex gap-4">
                    <div
                      className={`absolute -left-[18px] top-3 w-2.5 h-2.5 rounded-full border-2 border-background ${
                        it.kind === "post" ? "bg-pink-500/70" : "bg-primary/60"
                      }`}
                    />
                    <div className="w-12 flex-shrink-0 text-right">
                      <div className="text-xl font-bold leading-none">{day}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                        {dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                      </div>
                    </div>

                    {it.kind === "doc" ? (
                      <Card
                        className="flex-1 cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setOpenId(it.doc.id)}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="font-medium text-sm leading-snug flex-1">{it.doc.titulo}</h4>
                            {it.doc.tom_emocional && (
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{it.doc.tom_emocional}</Badge>
                            )}
                          </div>
                          {it.doc.local && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="w-3 h-3" /> {it.doc.local}
                            </div>
                          )}
                          {it.doc.resumo_executivo && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{it.doc.resumo_executivo}</p>
                          )}
                          <div className="flex flex-wrap gap-1">
                            <CountBadge icon={<Megaphone className="w-3 h-3" />} n={it.doc.propostas?.length} label="prop." />
                            <CountBadge icon={<Flag className="w-3 h-3" />} n={it.doc.promessas?.length} label="prom." />
                            <CountBadge icon={<Hash className="w-3 h-3" />} n={it.doc.bandeiras?.length} label="band." />
                            <CountBadge icon={<Quote className="w-3 h-3" />} n={it.doc.bordoes?.length} label="bord." />
                            <CountBadge icon={<MapPin className="w-3 h-3" />} n={it.doc.bairros_citados?.length} label="bairros" />
                            <CountBadge icon={<Users className="w-3 h-3" />} n={it.doc.pessoas_citadas?.length} label="pessoas" />
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <PostTimelineCard
                        post={it.post}
                        promoting={promoteOne.isPending && promoteOne.variables === it.post.post_id}
                        onPromote={() => promoteOne.mutate(it.post.post_id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <DocumentDrawer openId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function PostTimelineCard({
  post,
  promoting,
  onPromote,
}: {
  post: PostTimelineItem;
  promoting: boolean;
  onPromote: () => void;
}) {
  const isVideo = isVideoLike(post.post_full_picture, post.post_media_type);
  return (
    <Card className="flex-1 border-pink-500/20 bg-pink-500/[0.02]">
      <CardContent className="p-3">
        <div className="flex gap-3">
          {post.post_full_picture && (
            <div className="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-muted relative">
              {isVideo ? (
                <video
                  src={post.post_full_picture}
                  className="w-full h-full object-cover"
                  muted
                  preload="metadata"
                  onLoadedData={(e) => {
                    e.currentTarget.currentTime = 1;
                  }}
                />
              ) : (
                <img
                  src={post.post_full_picture}
                  alt="Post"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              <div className="absolute top-1 left-1 bg-white/90 rounded-full p-0.5 shadow-sm">
                {platformIcon(post.platform)}
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {!post.post_full_picture && platformIcon(post.platform)}
                <Badge variant="outline" className="text-[10px] capitalize">
                  Post {post.platform}
                </Badge>
              </div>
              {post.post_permalink_url && (
                <a
                  href={post.post_permalink_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <ExternalLink className="w-3 h-3" /> abrir
                </a>
              )}
            </div>
            {post.post_message ? (
              <p className="text-xs text-foreground line-clamp-3 leading-snug">{post.post_message}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">Sem legenda</p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {post.comments_count}
              </span>
              {post.sentiment_counts.positive > 0 && (
                <span className="flex items-center gap-0.5 text-green-600">
                  <TrendingUp className="w-3 h-3" /> {post.sentiment_counts.positive}
                </span>
              )}
              {post.sentiment_counts.neutral > 0 && (
                <span className="flex items-center gap-0.5">
                  <Minus className="w-3 h-3" /> {post.sentiment_counts.neutral}
                </span>
              )}
              {post.sentiment_counts.negative > 0 && (
                <span className="flex items-center gap-0.5 text-red-600">
                  <TrendingDown className="w-3 h-3" /> {post.sentiment_counts.negative}
                </span>
              )}
              {post.post_message && post.post_message.trim().length >= 30 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] ml-auto"
                  onClick={onPromote}
                  disabled={promoting}
                >
                  {promoting ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Promovendo…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1" /> Promover à memória
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================================================================
 * CONTRADIÇÕES
 * ========================================================================= */
function ContradictionsList({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ic-contradictions", clientId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("ic_document_contradictions" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("severidade", { ascending: true })
        .order("detected_at", { ascending: false });
      if (error) throw error;
      const docIds = Array.from(new Set((rows || []).flatMap((r: any) => [r.document_a_id, r.document_b_id])));
      let docs: Record<string, any> = {};
      if (docIds.length) {
        const { data: dd } = await supabase
          .from("ic_knowledge_documents")
          .select("id, titulo, data_evento")
          .in("id", docIds);
        docs = Object.fromEntries((dd || []).map((d: any) => [d.id, d]));
      }
      return { rows: (rows || []) as any[], docs };
    },
  });

  const detect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ic-detect-contradictions", {
        body: { clientId, replace: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Análise concluída: ${d?.count ?? 0} contradição(ões).`);
      qc.invalidateQueries({ queryKey: ["ic-contradictions", clientId] });
    },
    onError: (e: any) => toast.error(e.message || "Falha ao detectar contradições."),
  });

  const sevColor: Record<string, string> = {
    alta: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    media: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    baixa: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Detecta mudanças de posição e promessas incompatíveis entre documentos. Usa o LLM configurado para o cliente.
        </p>
        <Button size="sm" onClick={() => detect.mutate()} disabled={detect.isPending}>
          {detect.isPending
            ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            : <RefreshCw className="w-4 h-4 mr-1.5" />}
          Reanalisar
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>
      ) : !data?.rows.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Nenhuma contradição detectada ainda. Clique em <strong>Reanalisar</strong> para rodar a análise.
          </CardContent>
        </Card>
      ) : (
        data.rows.map((c) => {
          const a = data.docs[c.document_a_id];
          const b = data.docs[c.document_b_id];
          return (
            <Card key={c.id} className={`border ${sevColor[c.severidade] || sevColor.media}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={sevColor[c.severidade] || sevColor.media}>
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {c.severidade}
                    </Badge>
                    {c.tipo && <Badge variant="secondary" className="text-xs">{c.tipo.replace(/_/g, " ")}</Badge>}
                    {c.tema && <span className="text-sm font-semibold">{c.tema}</span>}
                  </div>
                </div>
                <p className="text-sm">{c.explicacao}</p>
                <div className="grid md:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-card/50 p-2.5">
                    <div className="font-medium text-muted-foreground mb-1">
                      {a?.titulo || "Documento A"}
                      {a?.data_evento && <span className="ml-1">· {new Date(a.data_evento).toLocaleDateString("pt-BR")}</span>}
                    </div>
                    {c.trecho_a && <div className="italic">"{c.trecho_a}"</div>}
                  </div>
                  <div className="rounded-md border bg-card/50 p-2.5">
                    <div className="font-medium text-muted-foreground mb-1">
                      {b?.titulo || "Documento B"}
                      {b?.data_evento && <span className="ml-1">· {new Date(b.data_evento).toLocaleDateString("pt-BR")}</span>}
                    </div>
                    {c.trecho_b && <div className="italic">"{c.trecho_b}"</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
