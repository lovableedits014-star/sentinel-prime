import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Activity, Heart, MessageSquare, Clock } from "lucide-react";
import type { PoolInstance } from "./WhatsAppInstancePoolCard";

interface Props {
  instances: PoolInstance[];
  clientId: string;
}

function isInWindow(start: string, end: string, enabled: boolean): boolean {
  if (!enabled) return true;
  // Convert UTC to America/Sao_Paulo (UTC-3)
  const now = new Date();
  const sp = new Date(now.getTime() - 3 * 3600 * 1000);
  const hh = sp.getUTCHours();
  const mm = sp.getUTCMinutes();
  const cur = hh * 60 + mm;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return cur >= sh * 60 + sm && cur < eh * 60 + em;
}

export default function WhatsAppPoolSummary({ instances, clientId }: Props) {
  const [windowCfg, setWindowCfg] = useState<{ start: string; end: string; enabled: boolean }>({
    start: "08:00:00",
    end: "22:00:00",
    enabled: true,
  });

  useEffect(() => {
    supabase
      .from("clients")
      .select("whatsapp_window_start, whatsapp_window_end, whatsapp_window_enabled")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWindowCfg({
            start: data.whatsapp_window_start || "08:00:00",
            end: data.whatsapp_window_end || "22:00:00",
            enabled: data.whatsapp_window_enabled ?? true,
          });
        }
      });
  }, [clientId, instances]);

  const total = instances.length;
  const active = instances.filter((i) => i.is_active && i.status === "connected").length;
  const sentToday = instances.reduce((acc, i) => acc + (i.messages_sent_today || 0), 0);
  const avgHealth = total > 0
    ? Math.round(instances.reduce((acc, i) => acc + (i.health_score || 0), 0) / total)
    : 0;
  const inWindow = isInWindow(windowCfg.start, windowCfg.end, windowCfg.enabled);

  const cards = [
    {
      icon: Activity,
      label: "Chips ativos",
      value: `${active}/${total}`,
      color: active > 0 ? "text-emerald-600" : "text-muted-foreground",
      bg: active > 0 ? "bg-emerald-500/10" : "bg-muted",
    },
    {
      icon: MessageSquare,
      label: "Enviadas hoje",
      value: sentToday.toLocaleString("pt-BR"),
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      icon: Heart,
      label: "Saúde média",
      value: total > 0 ? `${avgHealth}%` : "—",
      color: avgHealth >= 70 ? "text-emerald-600" : avgHealth >= 40 ? "text-amber-600" : "text-red-600",
      bg: avgHealth >= 70 ? "bg-emerald-500/10" : avgHealth >= 40 ? "bg-amber-500/10" : "bg-red-500/10",
    },
    {
      icon: Clock,
      label: "Janela horária",
      value: !windowCfg.enabled ? "24h" : inWindow ? "Ativa" : "Em pausa",
      color: !windowCfg.enabled || inWindow ? "text-emerald-600" : "text-muted-foreground",
      bg: !windowCfg.enabled || inWindow ? "bg-emerald-500/10" : "bg-muted",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-lg p-3 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-md ${c.bg} flex items-center justify-center`}>
            <c.icon className={`w-4 h-4 ${c.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className={`text-lg font-semibold leading-tight ${c.color}`}>{c.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}