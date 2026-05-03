import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Facebook, Instagram, TrendingUp, TrendingDown,
  Users, Calendar, Loader2, MessageSquare, Eye, BarChart3, FileText, ExternalLink,
} from "lucide-react";
import { BADGE_META, getBadgeMeta } from "@/lib/militant-badges";
import { MilitantBadge } from "@/components/comments/MilitantBadge";
import { AuthorHistoryDrawer } from "@/components/comments/AuthorHistoryDrawer";
import { MilitanciaCharts } from "@/components/militancia/MilitanciaCharts";
import { MilitanciaReport } from "@/components/militancia/MilitanciaReport";
import { getSocialProfileUrl } from "@/lib/social-url";
import type { MilitantRow } from "@/hooks/useMilitants";

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-card rounded-xl border p-3 sm:p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent || 'bg-primary/10 text-primary'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function MilitantList({
  militants, loading, onOpen,
}: {
  militants: MilitantRow[];
  loading: boolean;
  onOpen: (m: MilitantRow) => void;
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-muted rounded-lg"></div>)}
      </div>
    );
  }
  if (militants.length === 0) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">Nenhum perfil encontrado</p>
            <p className="text-sm mt-1">Os perfis aparecem automaticamente conforme as pessoas comentam.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="bg-card rounded-xl border shadow-sm divide-y overflow-hidden">
      {militants.map((m) => (
        <div
          key={m.id}
          className="w-full px-3 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
        >
          <button
            onClick={() => onOpen(m)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            <Avatar className="h-10 w-10 shrink-0">
              {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.author_name || ""} />}
              <AvatarFallback className={m.platform === 'instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs' : 'bg-primary/10 text-primary text-xs'}>
                {m.author_name?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{m.author_name || "Autor desconhecido"}</span>
                <MilitantBadge militant={m} />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" />{m.total_comments}</span>
                <span className="inline-flex items-center gap-1 text-green-600"><TrendingUp className="w-3 h-3" />{m.total_positive}</span>
                <span className="inline-flex items-center gap-1 text-destructive"><TrendingDown className="w-3 h-3" />{m.total_negative}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />última: {new Date(m.last_seen_at).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          </button>
          {(() => {
            const url = getSocialProfileUrl(m.platform, m.platform_user_id);
            return url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Abrir perfil no ${m.platform === 'instagram' ? 'Instagram' : 'Facebook'}`}
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : null;
          })()}
          <button
            onClick={() => onOpen(m)}
            title="Ver histórico"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

const Militancia = () => {
  const [search, setSearch] = useState("");
  const [badgeFilter, setBadgeFilter] = useState<string>("all");
  const [drawer, setDrawer] = useState<MilitantRow | null>(null);

  const { data: clientId } = useQuery({
    queryKey: ["current-client-id"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("clients").select("id").eq("user_id", user.id).limit(1).maybeSingle();
      return data?.id || null;
    },
    staleTime: Infinity,
  });

  const { data: militants = [], isLoading } = useQuery({
    queryKey: ["militants-all", clientId],
    queryFn: async () => {
      if (!clientId) return [] as MilitantRow[];
      const { data, error } = await (supabase as any)
        .from("social_militants")
        .select("*")
        .eq("client_id", clientId)
        .order("total_comments", { ascending: false })
        .limit(2000);
      if (error) {
        console.warn("[militants-all] error:", error.message);
        return [];
      }
      return (data ?? []) as MilitantRow[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });

  const filterByPlatform = (platform: string) => {
    return militants.filter((m) => {
      if (m.platform !== platform) return false;
      if (badgeFilter !== "all" && m.current_badge !== badgeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(m.author_name || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  };

  const fbList = useMemo(() => filterByPlatform("facebook"), [militants, search, badgeFilter]);
  const igList = useMemo(() => filterByPlatform("instagram"), [militants, search, badgeFilter]);

  const computeStats = (list: MilitantRow[]) => ({
    total: list.length,
    defensores: list.filter(m => m.current_badge === 'defensor' || m.current_badge === 'elite').length,
    haters: list.filter(m => m.current_badge === 'hater' || m.current_badge === 'critico').length,
    novos: list.filter(m => m.current_badge === 'novo').length,
  });
  const fbStats = computeStats(militants.filter(m => m.platform === 'facebook'));
  const igStats = computeStats(militants.filter(m => m.platform === 'instagram'));

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Militância Digital</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Mapeia automaticamente todo perfil que interage com seus posts. Identifica defensores, críticos e novos rostos sem trabalho manual — assim que alguém comenta, ele já entra aqui com o selo certo.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={badgeFilter === "all" ? "default" : "outline"} onClick={() => setBadgeFilter("all")} className="h-8 text-xs">Todos</Button>
          {Object.entries(BADGE_META).sort((a, b) => a[1].priority - b[1].priority).map(([key, meta]) => (
            <Button
              key={key}
              size="sm"
              variant={badgeFilter === key ? "default" : "outline"}
              onClick={() => setBadgeFilter(key)}
              className="h-8 text-xs gap-1"
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="facebook">
        <TabsList>
          <TabsTrigger value="facebook" className="gap-1.5">
            <Facebook className="w-4 h-4 text-blue-600" />
            <span>Facebook</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">{fbStats.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="instagram" className="gap-1.5">
            <Instagram className="w-4 h-4 text-pink-500" />
            <span>Instagram</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">{igStats.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="w-4 h-4 text-violet-600" />
            <span>Análise</span>
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5">
            <FileText className="w-4 h-4 text-amber-600" />
            <span>Relatório</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facebook" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Users className="w-4 h-4" />} label="Perfis Facebook" value={fbStats.total} />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Defensores" value={fbStats.defensores} accent="bg-green-500/10 text-green-700" />
            <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Críticos/Haters" value={fbStats.haters} accent="bg-destructive/10 text-destructive" />
            <StatCard icon={<Users className="w-4 h-4" />} label="Novos rostos" value={fbStats.novos} accent="bg-cyan-500/10 text-cyan-700" />
          </div>
          <MilitantList militants={fbList} loading={isLoading} onOpen={setDrawer} />
        </TabsContent>

        <TabsContent value="instagram" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Users className="w-4 h-4" />} label="Perfis Instagram" value={igStats.total} accent="bg-pink-500/10 text-pink-600" />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Defensores" value={igStats.defensores} accent="bg-green-500/10 text-green-700" />
            <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Críticos/Haters" value={igStats.haters} accent="bg-destructive/10 text-destructive" />
            <StatCard icon={<Users className="w-4 h-4" />} label="Novos rostos" value={igStats.novos} accent="bg-cyan-500/10 text-cyan-700" />
          </div>
          <MilitantList militants={igList} loading={isLoading} onOpen={setDrawer} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4 mt-4">
          <Tabs defaultValue="fb-charts">
            <TabsList>
              <TabsTrigger value="fb-charts" className="gap-1.5"><Facebook className="w-3.5 h-3.5 text-blue-600" /> Facebook</TabsTrigger>
              <TabsTrigger value="ig-charts" className="gap-1.5"><Instagram className="w-3.5 h-3.5 text-pink-500" /> Instagram</TabsTrigger>
            </TabsList>
            <TabsContent value="fb-charts" className="mt-4">
              <MilitanciaCharts militants={militants} platform="facebook" />
            </TabsContent>
            <TabsContent value="ig-charts" className="mt-4">
              <MilitanciaCharts militants={militants} platform="instagram" />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <MilitanciaReport militants={militants} />
        </TabsContent>
      </Tabs>

      {drawer && clientId && (
        <AuthorHistoryDrawer
          open={!!drawer}
          onOpenChange={(o) => !o && setDrawer(null)}
          clientId={clientId}
          platform={drawer.platform}
          platformUserId={drawer.platform_user_id}
          authorName={drawer.author_name}
          avatarUrl={drawer.avatar_url}
          militant={drawer}
        />
      )}
    </div>
  );
};

export default Militancia;
