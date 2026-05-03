import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, RefreshCw, Target, Facebook, Instagram, Globe,
  ArrowUp, ArrowRight, ArrowDown, CheckCircle2, X,
} from "lucide-react";
import { toast } from "sonner";

/* ── THEME DEFINITIONS (reused from Radar) ── */
const THEME_DEFINITIONS: Record<string, { label: string; keywords: string[] }> = {
  seguranca: { label: "Segurança Pública", keywords: ["segurança","seguranca","polícia","policia","crime","violência","violencia","assalto","roubo"] },
  saude: { label: "Saúde", keywords: ["saúde","saude","hospital","médico","medico","posto","atendimento","upa","sus","vacina"] },
  educacao: { label: "Educação", keywords: ["educação","educacao","escola","professor","aluno","ensino","faculdade","universidade"] },
  transporte: { label: "Transporte", keywords: ["ônibus","onibus","transporte","trânsito","transito","mobilidade","metrô","metro"] },
  emprego: { label: "Emprego e Economia", keywords: ["emprego","trabalho","desemprego","salário","salario","renda","economia","inflação","inflacao"] },
  moradia: { label: "Moradia", keywords: ["moradia","casa","aluguel","imóvel","imovel","habitação","habitacao","favela"] },
  meio_ambiente: { label: "Meio Ambiente", keywords: ["meio ambiente","desmatamento","poluição","poluicao","lixo","água","agua","saneamento","enchente"] },
  corrupcao: { label: "Corrupção e Política", keywords: ["corrupção","corrupcao","corrupto","desvio","propina","licitação","licitacao","cpi"] },
};

const STOPWORDS = new Set(["de","para","com","que","por","uma","um","como","mais","mas","não","nao","muito","bem","isso","esse","essa","tem","ter","ser","está","esta","são","sao","foi","vai","ele","ela","nos","das","dos","nas","seu","sua","meu","minha","aqui","ali","sim","já","ainda","também","tambem","todo","toda","quando","sobre","sem","até","ate","depois","antes","entre","cada","onde","porque","pois","então","entao","era","fazer","pode","tudo","ou","nem","lá","quem","qual","voce","você","gente","dia","vez","coisa"]);

function normalizeText(text: string): string[] {
  return text.toLowerCase().replace(/[^\wà-ú\s]/gi, " ").split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

type ThemeData = { key: string; label: string; total: number; growthPct: number | null };
type Suggestion = { title: string; description: string; theme: string; platform: string; priority: string };

const PRIORITY_CONFIG = {
  alta: { icon: ArrowUp, color: "text-destructive", badge: "bg-destructive/10 text-destructive" },
  media: { icon: ArrowRight, color: "text-amber-500", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  baixa: { icon: ArrowDown, color: "text-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

const PLATFORM_ICON = {
  facebook: Facebook,
  instagram: Instagram,
  ambos: Globe,
};

export default function AIMissionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [hasGenerated, setHasGenerated] = useState(false);

  const generateSuggestions = async () => {
    setLoading(true);
    setDismissed(new Set());

    try {
      // 1. Fetch recent comments to analyze themes
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      let clientId: string | null = null;
      const { data: client } = await supabase
        .from("clients").select("id").eq("user_id", session.user.id).maybeSingle();
      if (client) clientId = client.id;
      else {
        const { data: tm } = await supabase
          .from("team_members").select("client_id")
          .eq("user_id", session.user.id).eq("status", "active").maybeSingle();
        if (tm) clientId = tm.client_id;
      }
      if (!clientId) throw new Error("Cliente não encontrado");

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let allComments: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("comments")
          .select("text, comment_created_time, created_at")
          .eq("client_id", clientId)
          .eq("is_page_owner", false)
          .gte("created_at", sevenDaysAgo)
          .neq("text", "__post_stub__")
          .range(from, from + 999);
        if (data && data.length > 0) {
          allComments = allComments.concat(data);
          from += 1000;
          if (data.length < 1000) break;
        } else break;
      }

      // 2. Analyze themes locally
      const now = Date.now();
      const h24 = 24 * 60 * 60 * 1000;
      const themes: ThemeData[] = [];

      for (const [key, def] of Object.entries(THEME_DEFINITIONS)) {
        let total = 0, last24h = 0, prev24h = 0;
        for (const c of allComments) {
          const words = normalizeText(c.text);
          const matched = def.keywords.some(kw => kw.includes(" ") ? c.text.toLowerCase().includes(kw) : words.includes(kw));
          if (!matched) continue;
          total++;
          const ts = new Date(c.comment_created_time || c.created_at || "").getTime();
          if (now - ts <= h24) last24h++;
          else if (now - ts <= 2 * h24) prev24h++;
        }
        if (total === 0) continue;
        const growthPct = prev24h > 0 ? Math.round(((last24h - prev24h) / prev24h) * 100) : last24h > 0 ? 100 : null;
        themes.push({ key, label: def.label, total, growthPct });
      }

      themes.sort((a, b) => (b.growthPct ?? -Infinity) - (a.growthPct ?? -Infinity));

      // 3. Get sample comments for context
      const commentSamples = allComments
        .slice(0, 30)
        .map(c => c.text.slice(0, 150));

      // 4. Call edge function
      const { data: fnData, error: fnError } = await supabase.functions.invoke("suggest-missions", {
        body: { themes: themes.slice(0, 5), commentSamples, clientId },
      });

      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error);

      setSuggestions(fnData?.suggestions || []);
      setHasGenerated(true);

      if (!fnData?.suggestions?.length) {
        toast.info("Nenhuma sugestão gerada. Tente com mais comentários.");
      } else {
        toast.success(`${fnData.suggestions.length} sugestões geradas pela IA!`);
      }
    } catch (error: any) {
      console.error("Error generating suggestions:", error);
      toast.error(error.message || "Erro ao gerar sugestões");
    } finally {
      setLoading(false);
    }
  };

  const dismiss = (idx: number) => {
    setDismissed(prev => new Set([...prev, idx]));
  };

  const visibleSuggestions = suggestions.filter((_, i) => !dismissed.has(i));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Sugestões da IA</CardTitle>
            </div>
            <Button
              size="sm"
              onClick={generateSuggestions}
              disabled={loading}
              variant={hasGenerated ? "outline" : "default"}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Analisando..." : hasGenerated ? "Regenerar" : "Gerar sugestões"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A IA analisa os temas em alta nos comentários e sugere missões de engajamento relevantes.
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Loading */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-4 rounded-lg border space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !hasGenerated && (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Clique em "Gerar sugestões" para que a IA analise os temas em alta e proponha missões.</p>
            </div>
          )}

          {/* No results */}
          {!loading && hasGenerated && visibleSuggestions.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Todas as sugestões foram analisadas.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={generateSuggestions}>
                Gerar novas sugestões
              </Button>
            </div>
          )}

          {/* Suggestion cards */}
          {!loading && visibleSuggestions.map((s, visIdx) => {
            const realIdx = suggestions.indexOf(s);
            const pConfig = PRIORITY_CONFIG[s.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.media;
            const PriorityIcon = pConfig.icon;
            const PlatformIcon = PLATFORM_ICON[s.platform as keyof typeof PLATFORM_ICON] || Globe;

            return (
              <div
                key={realIdx}
                className="p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm">{s.title}</h4>
                      <Badge variant="outline" className={`text-[10px] ${pConfig.badge}`}>
                        <PriorityIcon className="w-3 h-3 mr-0.5" />
                        {s.priority}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground">{s.description}</p>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <PlatformIcon className="w-3 h-3" />
                        {s.platform}
                      </span>
                      <span>Tema: {s.theme}</span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => dismiss(realIdx)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
