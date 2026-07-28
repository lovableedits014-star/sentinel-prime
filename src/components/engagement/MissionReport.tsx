import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Facebook, Instagram, ExternalLink, CheckCircle2, Eye, Users, Download } from "lucide-react";
import { fmtPhoneBR } from "@/lib/phone-utils";

type Props = {
  missionId: string | null;
  onClose: () => void;
};

type EventRow = {
  id: string;
  mission_id: string;
  distribution_id: string | null;
  participant_id: string | null;
  event_type: "open" | "click_facebook" | "click_instagram" | "click_avulso" | "declared_done";
  created_at: string;
  is_bot: boolean;
};

type Participant = { id: string; nome: string; phone_e164: string };
type Distribution = { id: string; group_name_snapshot: string | null };

export default function MissionReport({ missionId, onClose }: Props) {
  const open = !!missionId;
  const [period, setPeriod] = useState<"7" | "30" | "all">("all");


  const { data: mission } = useQuery({
    queryKey: ["mission-report-header", missionId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("portal_missions")
        .select("id, title, tracking_enabled")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
    enabled: open,
  });

  const { data: events = [], isLoading } = useQuery<EventRow[]>({
    queryKey: ["mission-events", missionId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("mission_events")
        .select("id, mission_id, distribution_id, participant_id, event_type, created_at, is_bot")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(5000);
      return (data || []) as EventRow[];
    },
    enabled: open,
  });

  const participantIds = useMemo(
    () => Array.from(new Set(events.map((e) => e.participant_id).filter(Boolean) as string[])),
    [events],
  );
  const distributionIds = useMemo(
    () => Array.from(new Set(events.map((e) => e.distribution_id).filter(Boolean) as string[])),
    [events],
  );

  const { data: participants = [] } = useQuery<Participant[]>({
    queryKey: ["mission-participants", missionId, participantIds.length],
    queryFn: async () => {
      if (participantIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("mission_participants")
        .select("id, nome, phone_e164")
        .in("id", participantIds);
      return (data || []) as Participant[];
    },
    enabled: open && participantIds.length > 0,
  });

  const { data: distributions = [] } = useQuery<Distribution[]>({
    queryKey: ["mission-distributions", missionId, distributionIds.length],
    queryFn: async () => {
      if (distributionIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("mission_distributions")
        .select("id, group_name_snapshot")
        .in("id", distributionIds);
      return (data || []) as Distribution[];
    },
    enabled: open && distributionIds.length > 0,
  });

  const partMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const distMap = useMemo(() => new Map(distributions.map((d) => [d.id, d])), [distributions]);

  const realEvents = useMemo(() => {
    const all = events.filter((e) => !e.is_bot);
    if (period === "all") return all;
    const days = period === "7" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return all.filter((e) => new Date(e.created_at).getTime() >= cutoff);
  }, [events, period]);

  const stats = useMemo(() => {
    const s = { open: 0, click_facebook: 0, click_instagram: 0, click_avulso: 0, declared_done: 0 };
    for (const e of realEvents) s[e.event_type] = (s[e.event_type] || 0) + 1;
    const uniqueParticipants = new Set(realEvents.map((e) => e.participant_id).filter(Boolean)).size;
    return { ...s, unique: uniqueParticipants };
  }, [realEvents]);

  const byParticipant = useMemo(() => {
    const map = new Map<string, {
      nome: string; phone: string;
      open: number; click_facebook: number; click_instagram: number; click_avulso: number; declared_done: number;
      first: string; last: string;
      groups: Set<string>;
    }>();
    for (const e of realEvents) {
      if (!e.participant_id) continue;
      const p = partMap.get(e.participant_id);
      const key = e.participant_id;
      const row = map.get(key) || {
        nome: p?.nome || "Anônimo",
        phone: p ? fmtPhoneBR(p.phone_e164) : "—",
        open: 0, click_facebook: 0, click_instagram: 0, click_avulso: 0, declared_done: 0,
        first: e.created_at, last: e.created_at,
        groups: new Set<string>(),
      };
      row[e.event_type] += 1;
      if (e.created_at < row.first) row.first = e.created_at;
      if (e.created_at > row.last) row.last = e.created_at;
      if (e.distribution_id) {
        const g = distMap.get(e.distribution_id)?.group_name_snapshot;
        if (g) row.groups.add(g);
      }
      map.set(key, row);
    }
    return Array.from(map.entries()).map(([id, r]) => ({ id, ...r, groups: Array.from(r.groups) }))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [realEvents, partMap, distMap]);

  const byGroup = useMemo(() => {
    const map = new Map<string, {
      name: string;
      participants: Set<string>;
      open: number; click_facebook: number; click_instagram: number; click_avulso: number; declared_done: number;
    }>();
    for (const e of realEvents) {
      const distId = e.distribution_id || "__sem_grupo__";
      const name = e.distribution_id ? (distMap.get(e.distribution_id)?.group_name_snapshot || "Grupo") : "Sem grupo";
      const row = map.get(distId) || {
        name,
        participants: new Set<string>(),
        open: 0, click_facebook: 0, click_instagram: 0, click_avulso: 0, declared_done: 0,
      };
      row[e.event_type] += 1;
      if (e.participant_id) row.participants.add(e.participant_id);
      map.set(distId, row);
    }
    return Array.from(map.entries()).map(([id, r]) => ({ id, ...r, participants: r.participants.size }))
      .sort((a, b) => b.open - a.open);
  }, [realEvents, distMap]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatório da missão</DialogTitle>
          <DialogDescription>
            {mission?.title || "Missão"} — {mission?.tracking_enabled ? "rastreamento ativo" : "rastreamento desligado"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <StatCard icon={<Eye className="w-4 h-4" />} label="Aberturas" value={stats.open} />
              <StatCard icon={<Users className="w-4 h-4" />} label="Únicos" value={stats.unique} />
              <StatCard icon={<Facebook className="w-4 h-4 text-blue-600" />} label="Facebook" value={stats.click_facebook} />
              <StatCard icon={<Instagram className="w-4 h-4 text-pink-500" />} label="Instagram" value={stats.click_instagram} />
              <StatCard icon={<ExternalLink className="w-4 h-4" />} label="Link avulso" value={stats.click_avulso} />
              <StatCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Concluíram" value={stats.declared_done} />
            </div>

            {realEvents.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhum registro ainda para esta missão.</p>
            )}

            {byGroup.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Por grupo</p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="text-left p-2">Grupo</th>
                        <th className="text-right p-2">Únicos</th>
                        <th className="text-right p-2">Aberturas</th>
                        <th className="text-right p-2">FB</th>
                        <th className="text-right p-2">IG</th>
                        <th className="text-right p-2">Avulso</th>
                        <th className="text-right p-2">Concluíram</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byGroup.map((g) => (
                        <tr key={g.id} className="border-t">
                          <td className="p-2">{g.name}</td>
                          <td className="p-2 text-right">{g.participants}</td>
                          <td className="p-2 text-right">{g.open}</td>
                          <td className="p-2 text-right">{g.click_facebook}</td>
                          <td className="p-2 text-right">{g.click_instagram}</td>
                          <td className="p-2 text-right">{g.click_avulso}</td>
                          <td className="p-2 text-right">{g.declared_done}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {byParticipant.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Por participante</p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">Telefone</th>
                        <th className="text-left p-2">Grupo(s)</th>
                        <th className="text-right p-2">Abriu</th>
                        <th className="text-right p-2">FB</th>
                        <th className="text-right p-2">IG</th>
                        <th className="text-right p-2">Avulso</th>
                        <th className="text-center p-2">Concluiu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byParticipant.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2">{r.nome}</td>
                          <td className="p-2 text-xs text-muted-foreground">{r.phone}</td>
                          <td className="p-2 text-xs">{r.groups.length ? r.groups.join(", ") : "—"}</td>
                          <td className="p-2 text-right">{r.open}</td>
                          <td className="p-2 text-right">{r.click_facebook}</td>
                          <td className="p-2 text-right">{r.click_instagram}</td>
                          <td className="p-2 text-right">{r.click_avulso}</td>
                          <td className="p-2 text-center">
                            {r.declared_done > 0 ? <Badge variant="default" className="bg-emerald-600">Sim</Badge> : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
        <p className="text-xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
