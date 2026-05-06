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
  MapPin, Users, Megaphone, Quote, Hash, Flag, Calendar, FileAudio,
} from "lucide-react";
import { toast } from "sonner";

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

export function MemoriaPanel({ clientId }: { clientId: string | null | undefined }) {
  const [view, setView] = useState<"documentos" | "fatos">("documentos");
  if (!clientId) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Selecione um cliente.</CardContent></Card>;
  }
  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Memória viva do candidato
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Cada transcrição vira um <strong>documento estruturado</strong> com resumo, propostas, promessas, bordões,
            bairros e pessoas citadas. É a fonte de verdade para o DNA, redator de matérias, sugestões de disparo e o coringa.
          </p>
        </CardHeader>
      </Card>

      <Tabs value={view} onValueChange={(v) => setView(v as any)}>
        <TabsList>
          <TabsTrigger value="documentos"><FileText className="w-4 h-4 mr-1.5" />Documentos</TabsTrigger>
          <TabsTrigger value="fatos"><Sparkles className="w-4 h-4 mr-1.5" />Fatos avulsos</TabsTrigger>
        </TabsList>
        <TabsContent value="documentos" className="mt-4">
          <DocumentsList clientId={clientId} />
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

function DocumentDrawer({ openId, onClose }: { openId: string | null; onClose: () => void }) {
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
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading || !doc ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="space-y-5 pb-10">
              {doc.resumo_executivo && (
                <Section title="Resumo executivo">
                  <p className="text-sm leading-relaxed">{doc.resumo_executivo}</p>
                </Section>
              )}

              {Array.isArray(doc.pontos_principais) && doc.pontos_principais.length > 0 && (
                <Section title="Pontos principais">
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {doc.pontos_principais.map((p: string, i: number) => <li key={i}>{p}</li>)}
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
                </>
              )} />

              <ListSection title="Promessas" items={doc.promessas} render={(p) => (
                <>
                  <p className="text-sm">{p.texto}</p>
                  {p.tema && <Badge variant="outline" className="text-[10px] mt-1">{p.tema}</Badge>}
                </>
              )} />

              <ListSection title="Bandeiras" items={doc.bandeiras} render={(b) => (
                <>
                  <p className="text-sm font-medium">{b.tema}</p>
                  {b.posicao && <p className="text-xs text-muted-foreground mt-0.5">{b.posicao}</p>}
                </>
              )} />

              <ListSection title="Bordões" items={doc.bordoes} render={(b) => (
                <p className="text-sm italic">"{b.frase}"</p>
              )} />

              <ListSection title="Bairros citados" items={doc.bairros_citados} render={(b) => (
                <>
                  <p className="text-sm font-medium">📍 {b.nome}</p>
                  {b.contexto && <p className="text-xs text-muted-foreground mt-0.5">{b.contexto}</p>}
                </>
              )} />

              <ListSection title="Pessoas citadas" items={doc.pessoas_citadas} render={(p) => (
                <>
                  <p className="text-sm font-medium">👤 {p.nome} {p.papel && <span className="text-xs text-muted-foreground">— {p.papel}</span>}</p>
                  {p.contexto && <p className="text-xs text-muted-foreground mt-0.5">{p.contexto}</p>}
                </>
              )} />

              <ListSection title="Adversários citados" items={doc.adversarios_citados} render={(a) => (
                <>
                  <p className="text-sm font-medium">{a.nome_ou_referencia} {a.tipo && <span className="text-xs text-muted-foreground">— {a.tipo}</span>}</p>
                  {a.trecho && <p className="text-xs text-muted-foreground italic mt-0.5">"{a.trecho}"</p>}
                </>
              )} />

              <ListSection title="Números e dados" items={doc.numeros_e_dados} render={(n) => (
                <>
                  <p className="text-sm font-medium">{n.valor}</p>
                  {n.contexto && <p className="text-xs text-muted-foreground mt-0.5">{n.contexto}</p>}
                </>
              )} />

              {doc.texto_integral && (
                <Section title="Transcrição integral">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground mb-2">
                      Ver texto completo ({doc.texto_integral.length.toLocaleString("pt-BR")} caracteres)
                    </summary>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed bg-muted/50 p-3 rounded">
                      {doc.texto_integral}
                    </p>
                  </details>
                </Section>
              )}
            </div>
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
