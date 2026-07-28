import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Sparkles, Activity, Loader2, BarChart3 } from "lucide-react";

const Disparos = lazy(() => import("./Disparos"));
const MissoesIA = lazy(() => import("./MissoesIA"));
const StatusWhatsApp = lazy(() => import("./StatusWhatsApp"));
const MissionsDashboard = lazy(() => import("@/components/engagement/MissionsDashboard"));

const VALID_TABS = ["disparos", "missoes", "relatorios", "status"] as const;
type TabKey = (typeof VALID_TABS)[number];

function Fallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function CentralWhatsApp() {
  const [params, setParams] = useSearchParams();
  const tab = useMemo<TabKey>(() => {
    const t = params.get("tab");
    return (VALID_TABS as readonly string[]).includes(t ?? "")
      ? (t as TabKey)
      : "disparos";
  }, [params]);

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next, { replace: true });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Send className="w-5 h-5 text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Central WhatsApp</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Disparos, missões inteligentes, relatórios e status das instâncias em um único lugar.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-2">
        <TabsList>
          <TabsTrigger value="disparos" className="gap-1.5">
            <Send className="w-4 h-4" />
            Disparos
          </TabsTrigger>
          <TabsTrigger value="missoes" className="gap-1.5">
            <Sparkles className="w-4 h-4" />
            Missões IA
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5">
            <BarChart3 className="w-4 h-4" />
            Relatórios
          </TabsTrigger>
          <TabsTrigger value="status" className="gap-1.5">
            <Activity className="w-4 h-4" />
            Status WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="disparos" className="-mx-4 md:-mx-6">
          <Suspense fallback={<Fallback />}>
            <Disparos />
          </Suspense>
        </TabsContent>
        <TabsContent value="missoes" className="-mx-4 md:-mx-6">
          <Suspense fallback={<Fallback />}>
            <MissoesIA />
          </Suspense>
        </TabsContent>
        <TabsContent value="relatorios" className="-mx-4 md:-mx-6">
          <Suspense fallback={<Fallback />}>
            <MissionsDashboard />
          </Suspense>
        </TabsContent>
        <TabsContent value="status" className="-mx-4 md:-mx-6">
          <Suspense fallback={<Fallback />}>
            <StatusWhatsApp />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
