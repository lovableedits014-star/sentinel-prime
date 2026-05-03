import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Newspaper, Globe2, TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw, Info, Search, Sparkles, X, Bell, Bookmark, BookmarkPlus, Trash2, Download, FileText, FileSpreadsheet } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar, Cell, Line, LineChart } from "recharts";
import MediaAlertsManager from "@/components/midia/MediaAlertsManager";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/**
 * Página dedicada de Mídia (GDELT) — cobertura noticiosa em tempo quase real.
 * Filtros: UF, município, palavras-chave (livres + presets), janela temporal, país.
 */

type GdeltArticle = {
  title: string;
  url: string;
  domain: string;
  seendate: string;
  language: string;
  sourcecountry: string;
  tone: number | null;
  source?: "gdelt" | "google_news";
};

type GdeltData = {
  query: string;
  timespan: string;
  country: string;
  total_articles: number;
  tone_summary: { avg: number | null; positives: number; neutrals: number; negatives: number; total: number };
  top_sources: { domain: string; count: number }[];
  timeline: { date: string; volume: number; tone: number | null }[];
  articles: GdeltArticle[];
  source_breakdown?: { gdelt: number; google_news: number; merged: number };
  sources_used?: string[];
  source_warnings?: Record<string, string>;
  generated_at: string;
};

type SavedSearch = {
  id: string;
  name: string;
  terms: string[];
  uf: string | null;
  municipio: string | null;
  timespan: string;
  country: string;
  created_at: string;
};

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const PRESETS = [
  { label: "Eleições 2026", terms: ["eleições 2026", "candidato"] },
  { label: "Reforma Tributária", terms: ["reforma tributária"] },
  { label: "Segurança Pública", terms: ["segurança pública", "violência"] },
  { label: "Saúde", terms: ["saúde", "SUS"] },
  { label: "Educação", terms: ["educação", "escola"] },
  { label: "Economia", terms: ["economia", "inflação", "juros"] },
  { label: "Lula", terms: ["Lula"] },
  { label: "Bolsonaro", terms: ["Bolsonaro"] },
  { label: "Congresso", terms: ["congresso", "câmara", "senado"] },
  { label: "STF", terms: ["STF", "supremo"] },
];

function fmtDate(iso: string) {
  if (!iso) return "";
  if (/^\d{8}T/.test(iso)) {
    const y = iso.slice(0, 4), m = iso.slice(4, 6), d = iso.slice(6, 8);
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleDateString("pt-BR");
}

function toneColor(tone: number | null) {
  if (tone == null) return "bg-muted text-muted-foreground";
  if (tone >= 1.5) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (tone <= -1.5) return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
}

function toneLabel(tone: number | null) {
  if (tone == null) return "—";
  if (tone >= 1.5) return "Positivo";
  if (tone <= -1.5) return "Negativo";
  return "Neutro";
}

/** Monta query string GDELT a partir de termos + município + UF */
function buildQuery(terms: string[], municipio: string, uf: string): string {
  const parts: string[] = [];
  const cleanTerms = terms.map((t) => t.trim()).filter(Boolean);
  if (cleanTerms.length > 0) {
    // Termos com espaço viram "frase exata"
    const wrapped = cleanTerms.map((t) => (t.includes(" ") && !t.startsWith('"') ? `"${t}"` : t));
    parts.push(wrapped.length > 1 ? `(${wrapped.join(" OR ")})` : wrapped[0]);
  }
  if (municipio) parts.push(`"${municipio}"`);
  if (uf) parts.push(uf);
  return parts.join(" ");
}

/** Constrói parâmetro `sources` para a Edge Function */
function sourcesKey(s: { gdelt: boolean; google_news: boolean }): string {
  const list: string[] = [];
  if (s.gdelt) list.push("gdelt");
  if (s.google_news) list.push("google_news");
  return list.join(",") || "gdelt";
}

/** Label legível por fonte */
function sourceLabel(src?: string): string {
  if (src === "google_news") return "Google News";
  if (src === "gdelt") return "GDELT";
  return "—";
}

/** URL do favicon do veículo (Google S2). */
function faviconFor(domain: string): string {
  const d = (domain || "").trim().toLowerCase();
  if (!d || d === "—") return "";
  // Domínios com espaço (nomes em vez de host) — não tem favicon
  if (/\s/.test(d)) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=32`;
}

/** Converte seendate (GDELT YYYYMMDDTHHMMSSZ ou ISO) em Date. */
function parseSeenDate(s: string): Date | null {
  if (!s) return null;
  if (/^\d{8}T\d{6}Z$/.test(s)) {
    const y = s.slice(0, 4), mo = s.slice(4, 6), d = s.slice(6, 8);
    const h = s.slice(9, 11), mi = s.slice(11, 13), se = s.slice(13, 15);
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Rótulo de grupo: "Hoje" / "Ontem" / "Há N dias" / data longa. */
function groupLabelForDate(d: Date | null): string {
  if (!d) return "Sem data";
  const today = new Date();
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((day0 - dDay) / 86400000);
  if (diffDays <= 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays <= 6) return `Há ${diffDays} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtTime(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const MidiaPage = () => {
  const [terms, setTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState("");
  const [uf, setUf] = useState<string>("");
  const [municipio, setMunicipio] = useState<string>("");
  const [country, setCountry] = useState<string>("BR");
  const [timespan, setTimespan] = useState<string>("7d");
  const [sources, setSources] = useState<{ gdelt: boolean; google_news: boolean }>({ gdelt: true, google_news: true });
  const [submitted, setSubmitted] = useState<{ q: string; ts: string; c: string; src: string } | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: clients } = await supabase.from("clients").select("id").eq("user_id", user.id).limit(1);
      if (clients && clients.length > 0) setClientId(clients[0].id);
    })();
  }, []);

  // Contador de alertas não lidos para o badge da aba
  const { data: unreadAlerts = 0 } = useQuery<number>({
    queryKey: ["media-alert-unread", clientId],
    enabled: !!clientId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("media_alert_events")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId!)
        .eq("is_read", false);
      return count || 0;
    },
  });

  // Buscas salvas do usuário/cliente
  const { data: savedSearches = [] } = useQuery<SavedSearch[]>({
    queryKey: ["media-saved-searches", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_saved_searches")
        .select("id, name, terms, uf, municipio, timespan, country, created_at")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        terms: Array.isArray(r.terms) ? r.terms : [],
      })) as SavedSearch[];
    },
  });

  const loadSearch = (s: SavedSearch) => {
    setTerms(s.terms || []);
    setUf(s.uf || "");
    setMunicipio(s.municipio || "");
    setTimespan(s.timespan || "7d");
    setCountry(s.country || "BR");
    const q = buildQuery(s.terms || [], (s.municipio || "").trim(), (s.uf || "").trim());
    if (q.length >= 2) setSubmitted({ q, ts: s.timespan, c: s.country, src: sourcesKey(sources) });
    toast.success(`Busca "${s.name}" carregada`);
  };

  const saveCurrentSearch = async () => {
    if (!clientId || !userId) {
      toast.error("Cliente não identificado");
      return;
    }
    const name = saveName.trim();
    if (!name) {
      toast.error("Dê um nome para a busca");
      return;
    }
    if (terms.length === 0 && !municipio.trim() && !uf.trim()) {
      toast.error("Configure ao menos um filtro antes de salvar");
      return;
    }
    const { error } = await supabase.from("media_saved_searches").insert({
      client_id: clientId,
      user_id: userId,
      name,
      terms,
      uf: uf || null,
      municipio: municipio.trim() || null,
      timespan,
      country,
    });
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success(`Busca "${name}" salva`);
    setSaveName("");
    setSaveDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["media-saved-searches", clientId] });
  };

  const deleteSearch = async (id: string, name: string) => {
    const { error } = await supabase.from("media_saved_searches").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success(`"${name}" removida`);
    queryClient.invalidateQueries({ queryKey: ["media-saved-searches", clientId] });
  };

  // ===== Exportação =====
  const exportFileBase = useMemo(() => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, "");
    const slug = (terms.join("-") || municipio || uf || "midia")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "midia";
    return `midia_${slug}_${stamp}`;
  }, [terms, municipio, uf]);

  const exportCSV = () => {
    if (!data || data.articles.length === 0) {
      toast.error("Nenhuma notícia para exportar");
      return;
    }
    const headers = ["Título", "Tom", "Tom (label)", "Fonte", "Domínio", "Data", "País", "Idioma", "URL"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const a of data.articles) {
      lines.push([
        escape(a.title || ""),
        escape(a.tone != null ? a.tone.toFixed(2) : ""),
        escape(toneLabel(a.tone)),
        escape(sourceLabel(a.source)),
        escape(a.domain || ""),
        escape(fmtDate(a.seendate)),
        escape(a.sourcecountry || ""),
        escape((a.language || "").toUpperCase()),
        escape(a.url || ""),
      ].join(","));
    }
    // BOM para Excel reconhecer UTF-8 (acentos)
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportFileBase}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`CSV com ${data.articles.length} notícia(s) gerado`);
  };

  const exportPDF = async () => {
    if (!data || data.articles.length === 0) {
      toast.error("Nenhuma notícia para exportar");
      return;
    }
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.text("Mídia & Cobertura Noticiosa", 40, 40);

      doc.setFontSize(9);
      doc.setTextColor(110);
      const filtros = [
        terms.length > 0 ? `Termos: ${terms.join(", ")}` : null,
        uf ? `UF: ${uf}` : null,
        municipio ? `Município: ${municipio}` : null,
        `Janela: ${timespan}`,
        `País: ${country}`,
      ].filter(Boolean).join(" · ");
      doc.text(filtros, 40, 56, { maxWidth: pageWidth - 80 });
      doc.text(
        `Total: ${data.total_articles.toLocaleString("pt-BR")} matérias · Tom médio: ${
          data.tone_summary.avg != null ? data.tone_summary.avg.toFixed(2) : "—"
        } · Gerado em ${new Date().toLocaleString("pt-BR")}`,
        40,
        70,
      );
      doc.setTextColor(0);

      const rows = data.articles.map((a) => [
        a.title || "(sem título)",
        toneLabel(a.tone) + (a.tone != null ? ` (${a.tone.toFixed(1)})` : ""),
        sourceLabel(a.source),
        a.domain || "",
        fmtDate(a.seendate),
        a.sourcecountry || "",
        a.url || "",
      ]);

      autoTable(doc, {
        head: [["Título", "Tom", "Fonte", "Domínio", "Data", "País", "URL"]],
        body: rows,
        startY: 88,
        styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 230 },
          1: { cellWidth: 70 },
          2: { cellWidth: 70 },
          3: { cellWidth: 100 },
          4: { cellWidth: 60 },
          5: { cellWidth: 50 },
          6: { cellWidth: 200, textColor: [29, 78, 216] },
        },
        didDrawPage: (d: any) => {
          const pageNum = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(
            `Sentinelle · Página ${pageNum} · Fontes: GDELT + Google News`,
            40,
            doc.internal.pageSize.getHeight() - 16,
          );
          doc.setTextColor(0);
        },
        didDrawCell: (d: any) => {
          // Tornar URLs clicáveis
          if (d.section === "body" && d.column.index === 6 && d.cell.raw) {
            const url = String(d.cell.raw);
            if (url.startsWith("http")) {
              doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url });
            }
          }
        },
      });

      doc.save(`${exportFileBase}.pdf`);
      toast.success(`PDF com ${data.articles.length} notícia(s) gerado`);
    } catch (err: any) {
      console.error(err);
      toast.error("Falha ao gerar PDF: " + (err?.message || "erro desconhecido"));
    }
  };

  const addTerm = (t: string) => {
    const v = t.trim();
    if (!v) return;
    if (!terms.includes(v)) setTerms((prev) => [...prev, v]);
  };
  const removeTerm = (t: string) => setTerms((prev) => prev.filter((x) => x !== t));

  const handleAddInput = () => {
    if (termInput.trim()) {
      addTerm(termInput);
      setTermInput("");
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = buildQuery(terms, municipio.trim(), uf.trim());
    if (q.length < 2) return;
    setSubmitted({ q, ts: timespan, c: country, src: sourcesKey(sources) });
  };

  const { data, isLoading, isFetching, refetch, error } = useQuery<GdeltData | null>({
    queryKey: ["midia-gdelt", submitted?.q, submitted?.ts, submitted?.c, submitted?.src],
    enabled: !!submitted && (submitted.q?.length ?? 0) >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!submitted) return null;
      const params = new URLSearchParams({
        query: submitted.q,
        country: submitted.c,
        timespan: submitted.ts,
        maxrecords: "75",
        sources: submitted.src || "gdelt,google_news",
      });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gdelt-media-fetch?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao consultar GDELT");
      return json.data as GdeltData;
    },
  });

  const chartData = useMemo(() => {
    if (!data?.timeline) return [];
    return data.timeline.map((p) => ({ date: p.date, volume: p.volume, tone: p.tone ?? 0 }));
  }, [data]);

  const sentimentBars = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Positivo", value: data.tone_summary.positives },
      { label: "Neutro", value: data.tone_summary.neutrals },
      { label: "Negativo", value: data.tone_summary.negatives },
    ];
  }, [data]);

  /** Top veículos com volume + tom médio (calculado client-side a partir dos artigos). */
  const topVehiclesWithTone = useMemo(() => {
    if (!data?.articles) return [];
    const map = new Map<string, { count: number; toneSum: number; toneN: number }>();
    for (const a of data.articles) {
      const d = (a.domain || "").trim();
      if (!d) continue;
      const cur = map.get(d) ?? { count: 0, toneSum: 0, toneN: 0 };
      cur.count++;
      if (typeof a.tone === "number" && !Number.isNaN(a.tone)) {
        cur.toneSum += a.tone;
        cur.toneN++;
      }
      map.set(d, cur);
    }
    return [...map.entries()]
      .map(([domain, v]) => ({ domain, count: v.count, avgTone: v.toneN > 0 ? v.toneSum / v.toneN : null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [data]);

  /** Notícias agrupadas por rótulo de data ("Hoje", "Ontem", ...). */
  const groupedArticles = useMemo(() => {
    if (!data?.articles) return [] as Array<{ label: string; items: GdeltArticle[] }>;
    const groups: Array<{ label: string; items: GdeltArticle[] }> = [];
    const indexByLabel = new Map<string, number>();
    for (const a of data.articles) {
      const dt = parseSeenDate(a.seendate);
      const label = groupLabelForDate(dt);
      let idx = indexByLabel.get(label);
      if (idx === undefined) {
        idx = groups.length;
        indexByLabel.set(label, idx);
        groups.push({ label, items: [] });
      }
      groups[idx].items.push(a);
    }
    return groups;
  }, [data]);

  /** Lista plana de artigos para navegação por teclado (j/k/Enter). */
  const flatArticles = useMemo(
    () => groupedArticles.flatMap((g) => g.items),
    [groupedArticles],
  );
  const feedRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, flatArticles.length);
    if (focusedIdx >= flatArticles.length) setFocusedIdx(-1);
  }, [flatArticles.length, focusedIdx]);

  const focusArticle = useCallback((i: number) => {
    const el = itemRefs.current[i];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setFocusedIdx(i);
    }
  }, []);

  const handleFeedKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (flatArticles.length === 0) return;
      const target = e.target as HTMLElement;
      // Não interferir em inputs/textareas dentro do feed
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const cur = focusedIdx < 0 ? -1 : focusedIdx;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        focusArticle(Math.min(flatArticles.length - 1, cur + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        focusArticle(Math.max(0, cur - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        focusArticle(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusArticle(flatArticles.length - 1);
      }
    },
    [flatArticles.length, focusedIdx, focusArticle],
  );

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Newspaper className="w-8 h-8 text-primary" />
            Mídia & Cobertura Noticiosa
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Monitore como temas, figuras políticas e municípios estão sendo cobertos pela imprensa.
            Combine palavras-chave, território (UF/município) e janela temporal. Dados via{" "}
            <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer" className="text-primary underline">GDELT</a>
            {" "}e <a href="https://news.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google News</a>.
          </p>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        )}
      </div>

      <Tabs defaultValue="monitor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monitor" className="gap-1.5">
            <Search className="w-3.5 h-3.5" /> Monitoramento
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="w-3.5 h-3.5" /> Alertas
            {unreadAlerts > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">{unreadAlerts}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="mt-0">
          {/* Layout 2 colunas: filtros sticky à esquerda + análise à direita */}
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
          {/* === Coluna ESQUERDA (sticky) === */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" /> Filtros de busca
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Adicione múltiplas palavras-chave (combinadas com OR). UF e município restringem
                  geograficamente. Use os presets para temas comuns.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>Combine palavras-chave + território + janela temporal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Palavras-chave */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Palavras-chave (Enter para adicionar)
              </label>
              <div className="flex gap-2">
                <Input
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddInput();
                    }
                  }}
                  placeholder='Ex.: "reforma tributária", Lula, "Campo Grande"'
                />
                <Button type="button" variant="outline" onClick={handleAddInput} disabled={!termInput.trim()}>
                  Adicionar
                </Button>
              </div>
              {terms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {terms.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button type="button" onClick={() => removeTerm(t)} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Presets */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => p.terms.forEach(addTerm)}
                  >
                    + {p.label}
                  </Button>
                ))}
                {terms.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTerms([])}>
                    Limpar tudo
                  </Button>
                )}
              </div>
            </div>

            {/* Fontes */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                Fontes de mídia
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <strong>GDELT</strong>: portais grandes, com análise de tom e linha do tempo.<br/>
                      <strong>Google News</strong>: agregador amplo, melhor cobertura regional.<br/>
                      Combine ambos para máxima cobertura.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 text-xs px-3 py-1.5 border rounded-md cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={sources.gdelt}
                    onChange={(e) => setSources((s) => ({ ...s, gdelt: e.target.checked || (!s.google_news) }))}
                    className="accent-primary"
                  />
                  <span>GDELT</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">tom + timeline</Badge>
                </label>
                <label className="flex items-center gap-2 text-xs px-3 py-1.5 border rounded-md cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={sources.google_news}
                    onChange={(e) => setSources((s) => ({ ...s, google_news: e.target.checked || (!s.gdelt) }))}
                    className="accent-primary"
                  />
                  <span>Google News</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">cobertura regional</Badge>
                </label>
              </div>
            </div>

            {/* UF + Município + Janela + País */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">UF</label>
                <Select value={uf || "__none__"} onValueChange={(v) => setUf(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">Todas as UFs</SelectItem>
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Município</label>
                <Input
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  placeholder="Ex.: Campo Grande"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Janela</label>
                <Select value={timespan} onValueChange={setTimespan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Últimas 24h</SelectItem>
                    <SelectItem value="3d">3 dias</SelectItem>
                    <SelectItem value="7d">7 dias</SelectItem>
                    <SelectItem value="14d">14 dias</SelectItem>
                    <SelectItem value="30d">30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">País fonte</label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BR">🇧🇷 Brasil</SelectItem>
                    <SelectItem value="US">🇺🇸 EUA</SelectItem>
                    <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                    <SelectItem value="all">🌎 Mundo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {terms.length === 0 && !municipio && !uf
                  ? "Adicione pelo menos uma palavra-chave ou município."
                  : <>Consulta gerada: <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{buildQuery(terms, municipio.trim(), uf.trim()) || "(vazia)"}</code></>}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Buscas salvas */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <Bookmark className="w-3.5 h-3.5 mr-1.5" />
                      Buscas salvas
                      {savedSearches.length > 0 && (
                        <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{savedSearches.length}</Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <div className="px-3 py-2 border-b">
                      <p className="text-sm font-semibold">Minhas buscas salvas</p>
                      <p className="text-[11px] text-muted-foreground">Clique para carregar e executar</p>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {savedSearches.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-4 text-center">
                          Nenhuma busca salva ainda. Configure filtros e clique em <strong>Salvar</strong>.
                        </p>
                      ) : (
                        savedSearches.map((s) => (
                          <div key={s.id} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/50 border-b last:border-0">
                            <button
                              type="button"
                              onClick={() => loadSearch(s)}
                              className="flex-1 text-left min-w-0"
                            >
                              <p className="text-sm font-medium truncate">{s.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {[
                                  s.terms?.length ? `${s.terms.length} termo(s)` : null,
                                  s.uf || null,
                                  s.municipio || null,
                                  s.timespan,
                                  s.country,
                                ].filter(Boolean).join(" · ")}
                              </p>
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteSearch(s.id, s.name)}
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Salvar busca atual */}
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={terms.length === 0 && !municipio.trim() && !uf.trim()}
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
                      Salvar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Salvar busca</DialogTitle>
                      <DialogDescription>
                        Dê um nome para reutilizar esta combinação de filtros depois.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input
                        placeholder='Ex.: "Lula em MS — última semana"'
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCurrentSearch(); } }}
                        autoFocus
                      />
                      <div className="rounded-md border bg-muted/40 p-2 text-[11px] space-y-0.5">
                        <p><strong>Termos:</strong> {terms.length > 0 ? terms.join(", ") : "—"}</p>
                        <p><strong>UF:</strong> {uf || "Todas"} · <strong>Município:</strong> {municipio || "—"}</p>
                        <p><strong>Janela:</strong> {timespan} · <strong>País:</strong> {country}</p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancelar</Button>
                      <Button type="button" onClick={saveCurrentSearch}>Salvar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button type="submit" disabled={terms.length === 0 && !municipio.trim() && !uf.trim()}>
                  <Search className="w-4 h-4 mr-1.5" /> Buscar mídia
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Mini-KPIs (apenas quando há dados) — coluna esquerda */}
      {data && !isLoading && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="p-3">
              <CardDescription className="text-[10px] flex items-center gap-1"><Newspaper className="w-3 h-3" /> Matérias</CardDescription>
              <CardTitle className="text-2xl">{data.total_articles.toLocaleString("pt-BR")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardDescription className="text-[10px] flex items-center gap-1">
                {data.tone_summary.avg != null && data.tone_summary.avg >= 1.5 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> :
                  data.tone_summary.avg != null && data.tone_summary.avg <= -1.5 ? <TrendingDown className="w-3 h-3 text-rose-500" /> :
                  <Minus className="w-3 h-3" />}
                Tom médio
              </CardDescription>
              <CardTitle className={`text-2xl ${data.tone_summary.avg != null && data.tone_summary.avg >= 1.5 ? "text-emerald-600 dark:text-emerald-400" : data.tone_summary.avg != null && data.tone_summary.avg <= -1.5 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                {data.tone_summary.avg != null ? data.tone_summary.avg.toFixed(2) : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardDescription className="text-[10px]">Negativas / Positivas</CardDescription>
              <CardTitle className="text-xl">
                <span className="text-rose-500">{data.tone_summary.negatives}</span>
                <span className="text-muted-foreground mx-1 text-base">/</span>
                <span className="text-emerald-500">{data.tone_summary.positives}</span>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardDescription className="text-[10px] flex items-center gap-1"><Globe2 className="w-3 h-3" /> Veículos</CardDescription>
              <CardTitle className="text-2xl">{data.top_sources.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}
          </aside>

          {/* === Coluna DIREITA === */}
          <section className="space-y-4 min-w-0">

      {/* Estados */}
      {!submitted && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Configure os filtros acima e clique em <strong>Buscar mídia</strong> para começar.</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{(error as Error).message}</CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Tendência de cobertura */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Tendência de cobertura
              </CardTitle>
              <CardDescription>Volume de matérias ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="vol2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <RTooltip />
                  <Area type="monotone" dataKey="volume" stroke="hsl(var(--primary))" fill="url(#vol2)" name="Volume" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Linha 2: Distribuição de tom + Top veículos com tom */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribuição de tom</CardTitle>
                <CardDescription>Polarização das matérias</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sentimentBars}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} />
                    <RTooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {sentimentBars.map((b, i) => (
                        <Cell
                          key={i}
                          fill={b.label === "Positivo" ? "hsl(160 84% 39%)" : b.label === "Negativo" ? "hsl(346 77% 50%)" : "hsl(38 92% 50%)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top veículos com tom médio */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-1.5">
                  <Globe2 className="w-4 h-4" /> Top veículos
                </CardTitle>
                <CardDescription>Volume e tom médio por fonte</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[200px] overflow-y-auto">
                  {topVehiclesWithTone.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground text-center">Nenhum veículo identificado.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                        <tr className="text-muted-foreground">
                          <th className="text-left px-3 py-1.5 font-medium">Veículo</th>
                          <th className="text-right px-2 py-1.5 font-medium">Matérias</th>
                          <th className="text-right px-3 py-1.5 font-medium">Tom</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topVehiclesWithTone.map((v) => (
                          <tr key={v.domain} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-1.5 truncate max-w-[160px]">
                              <span className="inline-flex items-center gap-1.5">
                                {faviconFor(v.domain) && (
                                  <img src={faviconFor(v.domain)} alt="" className="w-3.5 h-3.5 rounded-sm" loading="lazy" />
                                )}
                                <span className="truncate" title={v.domain}>{v.domain}</span>
                              </span>
                            </td>
                            <td className="text-right px-2 py-1.5 tabular-nums">{v.count}</td>
                            <td className={`text-right px-3 py-1.5 tabular-nums font-medium ${v.avgTone == null ? "text-muted-foreground" : v.avgTone >= 1.5 ? "text-emerald-600 dark:text-emerald-400" : v.avgTone <= -1.5 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {v.avgTone == null ? "—" : v.avgTone.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tom ao longo do tempo, se disponível */}
          {chartData.some((p) => p.tone !== 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolução do tom médio</CardTitle>
                <CardDescription>-10 (muito negativo) → +10 (muito positivo)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} domain={[-10, 10]} />
                    <RTooltip />
                    <Line type="monotone" dataKey="tone" stroke="hsl(346 77% 50%)" name="Tom médio" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Feed de notícias estilo card, agrupado por data */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <Newspaper className="w-4 h-4" /> Feed de notícias
                    <Badge variant="secondary" className="ml-1">{data.articles.length}</Badge>
                  </CardTitle>
                  <CardDescription>
                    Mais recentes primeiro · Clique ou pressione Enter para abrir a fonte ·{" "}
                    <span className="hidden sm:inline">
                      Atalhos: <kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">J</kbd>/<kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">↓</kbd> próximo,{" "}
                      <kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">K</kbd>/<kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">↑</kbd> anterior,{" "}
                      <kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">Home</kbd>/<kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">End</kbd> início/fim
                    </span>
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={data.articles.length === 0}>
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={exportCSV}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV (Excel)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportPDF}>
                      <FileText className="w-4 h-4 mr-2" /> PDF (relatório)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {data.articles.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center" role="status">
                  Nenhum artigo encontrado para esta combinação de filtros.
                </div>
              ) : (
                <div
                  ref={feedRef}
                  role="feed"
                  aria-busy={isFetching}
                  aria-label={`Feed de notícias com ${flatArticles.length} ${flatArticles.length === 1 ? "matéria" : "matérias"}. Use as setas para cima e para baixo, ou as teclas J e K, para navegar. Pressione Enter para abrir a matéria.`}
                  tabIndex={0}
                  onKeyDown={handleFeedKeyDown}
                  className="max-h-[720px] overflow-y-auto px-3 pb-3 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
                >
                  {groupedArticles.map((group) => (
                    <section key={group.label} aria-labelledby={`group-${group.label}`}>
                      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-1.5 mb-1 -mx-3 px-3 border-b">
                        <h3 id={`group-${group.label}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                          {group.label}
                          <Badge variant="outline" className="h-4 px-1 text-[10px]" aria-label={`${group.items.length} ${group.items.length === 1 ? "matéria" : "matérias"}`}>{group.items.length}</Badge>
                        </h3>
                      </div>
                      <ul className="space-y-2 list-none p-0 m-0">
                        {group.items.map((a, i) => {
                          const tone = a.tone;
                          const borderClass =
                            tone == null ? "border-l-muted" :
                            tone >= 1.5 ? "border-l-emerald-500" :
                            tone <= -1.5 ? "border-l-rose-500" :
                            "border-l-amber-500";
                          const dt = parseSeenDate(a.seendate);
                          const fav = faviconFor(a.domain);
                          // Índice global do artigo na lista plana
                          const globalIdx = flatArticles.indexOf(a);
                          const dateLabel = dt ? dt.toLocaleString("pt-BR") : "data desconhecida";
                          const ariaLabel = `${a.title || "Sem título"}. Veículo ${a.domain}. ${toneLabel(a.tone)}${a.tone != null ? ` (${a.tone.toFixed(1)})` : ""}. Publicado ${dateLabel}. Fonte ${sourceLabel(a.source)}. Abre em nova aba.`;
                          return (
                            <li key={`${a.url}-${i}`}>
                              <a
                                ref={(el) => { itemRefs.current[globalIdx] = el; }}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={ariaLabel}
                                aria-posinset={globalIdx + 1}
                                aria-setsize={flatArticles.length}
                                onFocus={() => setFocusedIdx(globalIdx)}
                                className={`block rounded-md border border-l-4 ${borderClass} bg-card p-3 hover:shadow-md hover:border-primary/30 hover:-translate-y-px transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary`}
                              >
                              <div className="flex items-start gap-3">
                                {fav ? (
                                  <img
                                    src={fav}
                                    alt=""
                                    aria-hidden="true"
                                    className="w-6 h-6 rounded shrink-0 mt-0.5 bg-muted"
                                    loading="lazy"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded shrink-0 mt-0.5 bg-muted flex items-center justify-center" aria-hidden="true">
                                    <Newspaper className="w-3 h-3 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium leading-snug group-hover:text-primary line-clamp-2">
                                    {a.title || "(sem título)"}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium text-foreground/70 truncate max-w-[180px]" title={a.domain}>
                                      {a.domain}
                                    </span>
                                    {dt && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <time dateTime={dt.toISOString()}>{fmtTime(dt)}</time>
                                      </>
                                    )}
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] h-4 px-1 ml-auto ${a.source === "google_news" ? "border-blue-500/40 text-blue-700 dark:text-blue-400" : "border-violet-500/40 text-violet-700 dark:text-violet-400"}`}
                                    >
                                      {sourceLabel(a.source)}
                                    </Badge>
                                    <Badge variant="outline" className={`text-[9px] h-4 px-1 ${toneColor(a.tone)}`}>
                                      {toneLabel(a.tone)}
                                      {a.tone != null && <span className="ml-1 opacity-70">{a.tone.toFixed(1)}</span>}
                                    </Badge>
                                  </div>
                                </div>
                                <ExternalLink aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                              </div>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground italic text-center">
            Fontes: GDELT + Google News
            {data.source_breakdown && (
              <> · {data.source_breakdown.gdelt} GDELT + {data.source_breakdown.google_news} Google News (após dedup: {data.source_breakdown.merged})</>
            )}
            {" "}· Atualizado {new Date(data.generated_at).toLocaleString("pt-BR")} ·
            Dados meramente informativos.
          </p>
        </>
      )}
          </section>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-0">
          <MediaAlertsManager clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MidiaPage;