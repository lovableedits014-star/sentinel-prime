import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, MessageCircle, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useRegioesEleicao } from "@/hooks/useRegioesEleicao";

type StatusRow = {
  pessoa_id: string;
  status: string;
  group_jid: string | null;
  entrou_visto_em: string | null;
  verificado_em: string;
};

type Pessoa = {
  id: string;
  nome: string;
  telefone: string;
  regiao: string | null;
  tipo: string;
  parent_id: string | null;
  created_at: string;
};

export default function EntradaGrupoPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [anonimosPorGrupo, setAnonimosPorGrupo] = useState<Record<string, number>>({});
  const [lastSync, setLastSync] = useState<string | null>(null);
  const { regioes } = useRegioesEleicao(clientId);

  async function load() {
    setLoading(true);
    const [{ data: st }, { data: ps }, { data: anon }] = await Promise.all([
      supabase.from("eleicao_pessoa_grupo_status" as any).select("*").eq("client_id", clientId),
      supabase.from("eleicao_pessoas" as any).select("id, nome, telefone, regiao, tipo, parent_id, created_at")
        .eq("client_id", clientId).in("tipo", ["cabo", "lider", "coordenador"]),
      supabase.from("whatsapp_group_participants" as any)
        .select("group_jid, is_lid_only").eq("client_id", clientId).is("left_seen_at", null),
    ]);
    setStatuses((st as any) || []);
    setPessoas((ps as any) || []);
    const anonMap: Record<string, number> = {};
    for (const p of (anon as any[]) || []) {
      if (p.is_lid_only) anonMap[p.group_jid] = (anonMap[p.group_jid] || 0) + 1;
    }
    setAnonimosPorGrupo(anonMap);
    const maxVerif = ((st as any[]) || []).reduce((acc: string | null, r: any) => {
      if (!r.verificado_em) return acc;
      if (!acc || r.verificado_em > acc) return r.verificado_em;
      return acc;
    }, null);
    setLastSync(maxVerif);
    setLoading(false);
  }

  useEffect(() => { if (clientId) load(); /* eslint-disable-next-line */ }, [clientId]);

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("eleicao-check-grupo-membros", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error || "Falha na sincronização");
      const s = data?.summary;
      toast.success(
        `Sincronizado: ${s?.regioes_sincronizadas || 0} região(ões), ${s?.entrou || 0} no grupo, ${s?.pendente || 0} pendente(s)`,
      );
      await load();
    } catch (e: any) {
      toast.error("Falha ao sincronizar", { description: e?.message });
    } finally {
      setSyncing(false);
    }
  }

  // Resolve região efetiva de uma pessoa subindo pela cadeia parent_id
  const regiaoPorPessoa = useMemo(() => {
    const byId = new Map(pessoas.map(p => [p.id, p]));
    const cache = new Map<string, string | null>();
    function resolve(id: string, depth = 0): string | null {
      if (depth > 5) return null;
      if (cache.has(id)) return cache.get(id)!;
      const p = byId.get(id);
      if (!p) return null;
      const r = p.regiao || (p.parent_id ? resolve(p.parent_id, depth + 1) : null);
      cache.set(id, r);
      return r;
    }
    const out = new Map<string, string | null>();
    for (const p of pessoas) out.set(p.id, resolve(p.id));
    return out;
  }, [pessoas]);

  const statusByPessoa = useMemo(() => {
    const m = new Map<string, StatusRow>();
    for (const s of statuses) m.set(s.pessoa_id, s);
    return m;
  }, [statuses]);

  // Agrupa por região para o sumário
  const sumario = useMemo(() => {
    const map = new Map<string, { regiao: string; cadastrados: number; entrou: number; pendente: number; sem_telefone: number; sem_grupo: number; group_jid: string | null }>();
    for (const p of pessoas) {
      const reg = regiaoPorPessoa.get(p.id) || "sem-regiao";
      const st = statusByPessoa.get(p.id);
      if (!map.has(reg)) {
        map.set(reg, { regiao: reg, cadastrados: 0, entrou: 0, pendente: 0, sem_telefone: 0, sem_grupo: 0, group_jid: st?.group_jid || null });
      }
      const row = map.get(reg)!;
      row.cadastrados++;
      if (st?.group_jid && !row.group_jid) row.group_jid = st.group_jid;
      if (st?.status === "entrou") row.entrou++;
      else if (st?.status === "pendente") row.pendente++;
      else if (st?.status === "sem_telefone") row.sem_telefone++;
      else if (st?.status === "sem_grupo") row.sem_grupo++;
    }
    return Array.from(map.values()).sort((a, b) => a.regiao.localeCompare(b.regiao));
  }, [pessoas, statusByPessoa, regiaoPorPessoa]);

  const pendentes = useMemo(() => {
    return pessoas.filter(p => statusByPessoa.get(p.id)?.status === "pendente")
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [pessoas, statusByPessoa]);

  const fmtPhone = (s: string) => {
    const d = (s || "").replace(/\D/g, "");
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return s;
  };

  const labelRegiao = (v: string) => regioes.find(r => r.value === v)?.label || v;

  const sinceText = (iso: string | null) => {
    if (!iso) return "nunca";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `há ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `há ${hrs}h`;
    return `há ${Math.floor(hrs / 24)}d`;
  };

  if (loading) return <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" />Entrada no grupo da região</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Cruza os participantes dos grupos do WhatsApp com os cadastros. Última sync: {sinceText(lastSync)}
            </p>
          </div>
          <Button onClick={handleSync} disabled={syncing} size="sm">
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar agora
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">Região</th>
                <th className="py-2 px-2 text-right">Cadastrados</th>
                <th className="py-2 px-2 text-right">No grupo</th>
                <th className="py-2 px-2 text-right">Pendentes</th>
                <th className="py-2 px-2 text-right">Anônimos</th>
                <th className="py-2 px-2 text-right">% entrada</th>
              </tr>
            </thead>
            <tbody>
              {sumario.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground italic">Nenhum cadastro</td></tr>
              )}
              {sumario.map(s => {
                const total = s.cadastrados - s.sem_telefone - s.sem_grupo;
                const pct = total > 0 ? Math.round((s.entrou / total) * 100) : 0;
                const anon = s.group_jid ? (anonimosPorGrupo[s.group_jid] || 0) : 0;
                return (
                  <tr key={s.regiao} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-medium">{labelRegiao(s.regiao)}</td>
                    <td className="py-2 px-2 text-right">{s.cadastrados}</td>
                    <td className="py-2 px-2 text-right text-emerald-600 font-medium">{s.entrou}</td>
                    <td className="py-2 px-2 text-right text-amber-600">{s.pendente}</td>
                    <td className="py-2 px-2 text-right text-muted-foreground">{anon}</td>
                    <td className="py-2 px-2 text-right">
                      {!s.group_jid ? (
                        <Badge variant="outline" className="text-[10px]">sem grupo</Badge>
                      ) : (
                        <Badge variant={pct >= 80 ? "default" : pct >= 50 ? "secondary" : "destructive"} className="text-[10px]">{pct}%</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {Object.values(anonimosPorGrupo).some(n => n > 0) && (
          <div className="mt-3 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Anônimos = pessoas no grupo cujo número o WhatsApp esconde por privacidade. Podem ser cadastrados ou não — não conseguimos identificar.</span>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <div className="font-medium text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Pendentes ({pendentes.length})
            </div>
            <ChevronDown className="w-4 h-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2">
            {pendentes.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 py-3">
                <CheckCircle2 className="w-4 h-4" />
                Todos os cadastrados entraram no grupo!
              </div>
            ) : pendentes.map(p => {
              const reg = regiaoPorPessoa.get(p.id) || "sem-regiao";
              const diasDesde = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.tipo} · {labelRegiao(reg)} · cadastrado há {diasDesde}d · {fmtPhone(p.telefone)}
                    </div>
                  </div>
                  <a
                    href={`https://wa.me/${p.telefone.replace(/\D/g, "").startsWith("55") ? p.telefone.replace(/\D/g, "") : "55" + p.telefone.replace(/\D/g, "")}`}
                    target="_blank" rel="noreferrer"
                  >
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5" /> Abrir chat
                    </Button>
                  </a>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
