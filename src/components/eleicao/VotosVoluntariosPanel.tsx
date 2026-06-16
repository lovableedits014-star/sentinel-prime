import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2,
  Copy,
  MessageCircle,
  RefreshCw,
  Megaphone,
  ExternalLink,
  Crown,
  Users,
  UserCheck,
  Plus,
  UserPlus,
} from "lucide-react";

type Tipo = "coordenador" | "lider" | "cabo";

type Row = {
  indicador_id: string;
  client_id: string;
  nome: string;
  tipo: Tipo;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  parent_id: string | null;
  token: string | null;
  total_indicacoes: number;
  meta: number;
  ultimo_acesso_em: string | null;
  ultima_cobranca_em: string | null;
  cobrancas_enviadas: number;
};

const TIPO_META: Record<Tipo, { label: string; color: string; icon: any }> = {
  coordenador: { label: "Coordenador", color: "text-red-600 border-red-500/30 bg-red-500/10", icon: Crown },
  lider: { label: "Líder", color: "text-blue-600 border-blue-500/30 bg-blue-500/10", icon: Users },
  cabo: { label: "Cabo", color: "text-green-600 border-green-500/30 bg-green-500/10", icon: UserCheck },
};

function buildLink(token: string) {
  return `${window.location.origin}/indicar/${token}`;
}

function waPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  return d.length <= 11 ? "55" + d : d;
}

function buildMessage(r: Row, candidato: string, link: string) {
  const primeiro = r.nome.split(" ")[0] || r.nome;
  const cand = candidato ? ` para a campanha do ${candidato}` : "";
  const faltam = Math.max(0, r.meta - r.total_indicacoes);
  if (r.total_indicacoes === 0) {
    return (
      `Oi ${primeiro}! Aqui é da equipe${cand}. 🙌\n\n` +
      `Este é o SEU link pessoal de votos voluntários — você usa pra cadastrar pessoas que vão votar de verdade no candidato (eleitores que você conhece, NÃO são pessoas contratadas):\n${link}\n\n` +
      `Sua meta é trazer ${r.meta} indicações. Pode começar agora — vale tudo: família, amigos, vizinhos. Conta com você!`
    );
  }
  if (faltam > 0) {
    return (
      `Oi ${primeiro}! Você já cadastrou ${r.total_indicacoes} indicações de votos voluntários${cand} — obrigado! 👏\n\n` +
      `Faltam ${faltam} para bater sua meta de ${r.meta}. Continue pelo seu link:\n${link}`
    );
  }
  return (
    `${primeiro}, você bateu sua meta de ${r.meta} votos voluntários${cand}! 🎉\n\n` +
    `Pode continuar indicando pelo seu link — toda indicação ajuda:\n${link}`
  );
}

export default function VotosVoluntariosPanel({
  coordenadorId,
  candidatoNome,
}: {
  coordenadorId: string;
  candidatoNome: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "eleicao_listar_indicadores_team" as any,
      { _coordenador_id: coordenadorId },
    );
    if (error) {
      toast.error("Não foi possível carregar votos voluntários");
      setRows([]);
    } else {
      setRows(((data as any) || []) as Row[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (coordenadorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenadorId]);

  const me = useMemo(() => rows.find((r) => r.indicador_id === coordenadorId) || null, [rows, coordenadorId]);
  const equipe = useMemo(
    () => rows.filter((r) => r.indicador_id !== coordenadorId),
    [rows, coordenadorId],
  );

  const totalGeral = useMemo(() => rows.reduce((s, r) => s + (r.total_indicacoes || 0), 0), [rows]);
  const metaGeral = useMemo(() => rows.reduce((s, r) => s + (r.meta || 0), 0), [rows]);

  async function copiar(token: string) {
    await navigator.clipboard.writeText(buildLink(token));
    toast.success("Link copiado!");
  }

  function whatsapp(r: Row) {
    if (!r.token) {
      toast.error("Link ainda não disponível — atualize a página");
      return;
    }
    const link = buildLink(r.token);
    const msg = buildMessage(r, candidatoNome, link);
    const phone = waPhone(r.telefone || "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" />
          Votos voluntários (eleitores que não são contratados)
          <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" onClick={load} title="Atualizar">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 p-3 text-xs">
          ⚠️ <strong>Atenção:</strong> esta seção é diferente do cadastro de líderes e cabos contratados.
          Aqui são <strong>eleitores voluntários</strong> — pessoas que vão votar no candidato por convicção (família,
          amigos, vizinhos). Cada pessoa do seu time tem um <strong>link pessoal</strong> para cadastrar suas indicações.
          Você pode enviar o link de cada um pelo WhatsApp com 1 clique.
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-muted/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Total indicado</div>
            <div className="text-xl font-bold tabular-nums">{totalGeral}</div>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Meta do time</div>
            <div className="text-xl font-bold tabular-nums">{metaGeral}</div>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Pessoas</div>
            <div className="text-xl font-bold tabular-nums">{rows.length}</div>
          </div>
        </div>

        {/* Card do próprio coordenador */}
        {me && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`rounded-full flex items-center justify-center shrink-0 border w-8 h-8 ${TIPO_META.coordenador.color}`}>
                <Crown className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{me.nome} (você)</p>
                <p className="text-[11px] text-muted-foreground">
                  Sua meta pessoal: <strong>{me.total_indicacoes}</strong> de {me.meta} indicações
                </p>
              </div>
            </div>
            <ProgressBar total={me.total_indicacoes} meta={me.meta} />
            <div className="flex flex-wrap gap-1.5">
              {me.token && (
                <>
                  <a href={buildLink(me.token)} target="_blank" rel="noreferrer" className="inline-flex">
                    <Button size="sm" variant="default" className="h-8 gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir minha página de indicação
                    </Button>
                  </a>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => copiar(me.token!)}>
                    <Copy className="w-3.5 h-3.5" /> Copiar link
                  </Button>
                </>
              )}
            </div>

            {/* Form rápido para o coordenador cadastrar indicados aqui mesmo */}
            {me.token && (
              <QuickAddIndicado token={me.token} onAdded={load} />
            )}
          </div>
        )}

        {/* Lista do time */}
        {loading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : equipe.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Seu time ainda não tem líderes ou cabos cadastrados.
          </p>
        ) : (
          <div className="divide-y border rounded-md overflow-hidden">
            {equipe.map((r) => {
              const Icon = TIPO_META[r.tipo].icon;
              return (
                <div key={r.indicador_id} className="p-2.5 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-full flex items-center justify-center shrink-0 border w-7 h-7 ${TIPO_META[r.tipo].color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{r.nome}</span>
                        <Badge variant="outline" className="text-[9px]">{TIPO_META[r.tipo].label}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <ProgressBar total={r.total_indicacoes} meta={r.meta} compact />
                        <span className="text-[11px] tabular-nums shrink-0">
                          <strong>{r.total_indicacoes}</strong>
                          <span className="text-muted-foreground">/{r.meta}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {r.token && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Copiar link"
                          onClick={() => copiar(r.token!)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-emerald-600"
                        title="Enviar link via WhatsApp"
                        onClick={() => whatsapp(r)}
                        disabled={!r.token}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressBar({ total, meta, compact }: { total: number; meta: number; compact?: boolean }) {
  const pct = meta ? Math.min(100, Math.round((total / meta) * 100)) : 0;
  const cor =
    total === 0 ? "bg-red-500" :
    pct < 50 ? "bg-amber-500" :
    pct < 100 ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className={`flex-1 ${compact ? "h-1.5" : "h-2"} bg-muted rounded-full overflow-hidden ${compact ? "max-w-[180px]" : ""}`}>
      <div className={`h-full ${cor} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}
