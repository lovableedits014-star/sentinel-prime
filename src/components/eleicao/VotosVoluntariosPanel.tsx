import { useEffect, useMemo, useState, useRef } from "react";
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
  Trash2,
  ChevronUp,
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

type Indicado = {
  id: string;
  nome: string;
  telefone: string | null;
  bairro: string | null;
  created_at: string;
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

function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function fmtAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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
  bloqueado = false,
}: {
  coordenadorId: string;
  candidatoNome: string;
  bloqueado?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [meusIndicados, setMeusIndicados] = useState<Indicado[]>([]);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

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

  async function loadMeusIndicados(token: string) {
    const { data, error } = await supabase.rpc("eleicao_listar_indicados_token" as any, { _token: token });
    if (error) {
      console.warn("[VotosVoluntarios] listar indicados falhou", error);
      return;
    }
    setMeusIndicados(((data as any) || []) as Indicado[]);
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

  useEffect(() => {
    if (me?.token) loadMeusIndicados(me.token);
  }, [me?.token]);

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

  async function removerIndicado(token: string, indicadoId: string) {
    if (!confirm("Remover essa indicação? (só funciona até 1h após o cadastro)")) return;
    const { data } = await supabase.rpc("eleicao_remover_indicacao_token" as any, {
      _token: token,
      _indicado_id: indicadoId,
    });
    const r = data as any;
    if (r?.ok) {
      toast.success("Removida");
      await Promise.all([load(), loadMeusIndicados(token)]);
    } else if (r?.motivo === "prazo_expirado") {
      toast.warning("Prazo de remoção expirou (1h)");
    } else {
      toast.error("Não foi possível remover");
    }
  }

  async function onIndicadoAdded(forToken: string, newId?: string) {
    if (newId) {
      setLastAddedId(newId);
      setTimeout(() => setLastAddedId(null), 2500);
    }
    await load();
    if (me?.token && forToken === me.token) {
      await loadMeusIndicados(me.token);
    }
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

        {bloqueado && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-200 p-3 text-xs flex items-start gap-2">
            <span className="text-base leading-none">🔒</span>
            <div>
              <strong>Cadastro de votos voluntários temporariamente bloqueado pela administração da campanha.</strong>
              <div className="mt-1 opacity-90">Os links continuam abrindo, mas nenhuma nova indicação será aceita até a administração liberar.</div>
            </div>
          </div>
        )}


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
              <QuickAddIndicado
                token={me.token}
                inOwnCard
                disabled={bloqueado}
                onAdded={(id) => onIndicadoAdded(me.token!, id)}
              />
            )}

            {/* Últimos cadastrados pelo coordenador */}
            {me.token && meusIndicados.length > 0 && (
              <div className="rounded-md border bg-background">
                <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground border-b">
                  Últimos eleitores que você cadastrou ({meusIndicados.length})
                </div>
                <div className="divide-y max-h-[220px] overflow-y-auto">
                  {meusIndicados.map((ind) => (
                    <div
                      key={ind.id}
                      className={`px-2.5 py-1.5 flex items-center gap-2 text-xs transition-colors ${
                        lastAddedId === ind.id ? "bg-emerald-100 dark:bg-emerald-950/40" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{ind.nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {ind.telefone || "—"}{ind.bairro ? ` · ${ind.bairro}` : ""} · há {fmtAgo(ind.created_at)}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        title="Remover (até 1h após cadastro)"
                        onClick={() => removerIndicado(me.token!, ind.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
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
              const expanded = expandedFor === r.indicador_id;
              return (
                <div key={r.indicador_id} className="hover:bg-muted/40 transition-colors">
                  <div className="p-2.5 flex items-center gap-2">
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
                          variant={expanded ? "secondary" : "ghost"}
                          className="h-8 w-8"
                          title={expanded ? "Fechar" : "Cadastrar voto voluntário em nome desta pessoa"}
                          onClick={() => setExpandedFor(expanded ? null : r.indicador_id)}
                        >
                          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                        </Button>
                      )}
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
                  {expanded && r.token && (
                    <div className="px-2.5 pb-2.5">
                      <QuickAddIndicado
                        token={r.token}
                        nomePessoa={r.nome}
                        disabled={bloqueado}
                        onAdded={(id) => onIndicadoAdded(r.token!, id)}
                      />
                    </div>
                  )}
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

function QuickAddIndicado({
  token,
  nomePessoa,
  inOwnCard,
  disabled = false,
  onAdded,
}: {
  token: string;
  nomePessoa?: string;
  inOwnCard?: boolean;
  disabled?: boolean;
  onAdded: (newId?: string) => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bairro, setBairro] = useState("");
  const [saving, setSaving] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  const digits = telefone.replace(/\D/g, "");
  const telOk = digits.length === 10 || digits.length === 11;
  const nomeOk = nome.trim().length >= 2;
  const podeEnviar = telOk && nomeOk && !saving && !disabled;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeOk) { toast.error("Informe o nome completo"); return; }
    if (!telOk) {
      toast.error(digits.length < 10 ? "Faltou o DDD — use (DD) 9XXXX-XXXX" : "Telefone muito longo");
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = {
      _token: token,
      _nome: nome.trim(),
      _telefone: telefone,
    };
    if (bairro.trim()) payload._bairro = bairro.trim();

    const { data, error } = await supabase.rpc("eleicao_indicar_via_token" as any, payload as any);
    setSaving(false);

    if (error) {
      console.error("[VotosVoluntarios] indicar error", error);
      toast.error("Falha ao registrar — tente novamente");
      return;
    }
    const r = data as any;
    if (!r?.ok) {
      console.log("[VotosVoluntarios] indicar nao-ok", r);
      const msg: Record<string, string> = {
        duplicado: "Esse telefone já foi indicado anteriormente",
        telefone_invalido: "Telefone inválido — confira DDD e número",
        nome_invalido: "Nome inválido",
        limite_diario: "Limite diário de indicações atingido (tente amanhã)",
        token_invalido: "Link inválido",
        token_revogado: "Link desativado",
        cadastros_bloqueados: "Cadastros temporariamente bloqueados pela administração da campanha",
      };
      toast.warning(msg[r?.motivo] || `Não foi possível registrar (${r?.motivo || "erro"})`);
      return;
    }
    toast.success(
      nomePessoa
        ? `Cadastrado em nome de ${nomePessoa.split(" ")[0]} ✓`
        : "Indicação registrada! ✓",
    );
    setNome(""); setTelefone(""); setBairro("");
    nomeRef.current?.focus();
    await onAdded(r.id);
  }

  return (
    <form
      onSubmit={submit}
      className={`rounded-md border p-2.5 space-y-2 ${inOwnCard ? "bg-background" : "bg-muted/30"}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <UserPlus className="w-3.5 h-3.5" />
        {nomePessoa ? (
          <span>Cadastrar em nome de <strong className="text-foreground">{nomePessoa}</strong></span>
        ) : (
          <span>Adicionar indicação de voto voluntário</span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          ref={nomeRef}
          placeholder="Nome completo do eleitor"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-9"
          maxLength={120}
          disabled={disabled}
        />
        <Input
          placeholder="(DD) 9XXXX-XXXX"
          value={telefone}
          onChange={(e) => setTelefone(maskTelefone(e.target.value))}
          className="h-9"
          inputMode="tel"
          maxLength={16}
          disabled={disabled}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <Input
          placeholder="Bairro (opcional)"
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
          className="h-9"
          maxLength={80}
          disabled={disabled}
        />
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!podeEnviar} title={disabled ? "Cadastros bloqueados pela administração" : undefined}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {disabled ? "Bloqueado" : "Cadastrar"}
        </Button>
      </div>
      {(nome || telefone) && !podeEnviar && !saving && (
        <p className="text-[10px] text-muted-foreground">
          {!nomeOk && "Nome muito curto. "}
          {!telOk && digits.length > 0 && "Telefone precisa ter DDD + 8 ou 9 dígitos."}
        </p>
      )}
    </form>
  );
}
