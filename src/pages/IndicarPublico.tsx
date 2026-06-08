import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Check, Trash2, UserPlus } from "lucide-react";

type Info = {
  ok: boolean;
  motivo?: string;
  indicador_nome?: string;
  indicador_tipo?: string;
  candidato_nome?: string;
  candidato_logo?: string;
  total_indicacoes?: number;
  meta?: number;
  page_saudacao?: string | null;
  page_subtitulo?: string | null;
  page_funcao_label?: string | null;
  page_progresso_titulo?: string | null;
  page_botao_label?: string | null;
  page_rodape?: string | null;
};

type Indicado = { id: string; nome: string; telefone: string; bairro: string | null; created_at: string };

const fmtPhone = (s: string) => {
  const d = s.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
};
const maskPhoneInput = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const tipoLabel: Record<string, string> = {
  coordenador: "Coordenador(a)",
  lider: "Líder",
  cabo: "Cabo eleitoral",
};

export default function IndicarPublico() {
  const { token = "" } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bairro, setBairro] = useState("");
  const [obs, setObs] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentes, setRecentes] = useState<Indicado[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  async function loadInfo() {
    const { data, error } = await supabase.rpc("eleicao_indicador_info", { _token: token });
    if (error) { setInfo({ ok: false, motivo: "erro" }); return; }
    setInfo(data as any);
  }
  async function loadRecentes() {
    const { data } = await supabase.rpc("eleicao_listar_indicacoes_token", { _token: token, _limit: 20 });
    setRecentes((data as any) || []);
  }

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadInfo(), loadRecentes()]);
      setLoading(false);
    })();
  }, [token]);

  const progresso = useMemo(() => {
    const total = info?.total_indicacoes || 0;
    const meta = info?.meta || 1;
    return Math.min(100, Math.round((total / meta) * 100));
  }, [info]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const d = telefone.replace(/\D/g, "");
    if (nome.trim().length < 2) { toast.error("Informe o nome completo"); return; }
    if (d.length < 10 || d.length > 11) { toast.error("Telefone inválido — use DDD + número"); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("eleicao_indicar_via_token", {
      _token: token,
      _nome: nome.trim(),
      _telefone: telefone,
      _bairro: bairro || undefined,
      _observacao: obs || undefined,
    });
    setSaving(false);
    if (error) { toast.error("Falha ao registrar — tente novamente"); return; }
    const r = data as any;
    if (!r?.ok) {
      const msg: Record<string, string> = {
        duplicado: "Esse telefone já foi indicado anteriormente",
        telefone_invalido: "Telefone inválido",
        nome_invalido: "Nome inválido",
        limite_diario: "Você atingiu o limite diário de indicações — tente amanhã",
        token_invalido: "Link inválido",
        token_revogado: "Esse link foi desativado pelo administrador",
      };
      toast.warning(msg[r?.motivo] || "Não foi possível registrar");
      return;
    }
    toast.success("Indicação registrada! ✓");
    setNome(""); setTelefone(""); setBairro(""); setObs(""); setExtraOpen(false);
    setJustSaved(true); setTimeout(() => setJustSaved(false), 1500);
    await Promise.all([loadInfo(), loadRecentes()]);
  }

  async function remover(id: string) {
    if (!confirm("Remover essa indicação?")) return;
    const { data } = await supabase.rpc("eleicao_remover_indicacao_token", { _token: token, _indicado_id: id });
    const r = data as any;
    if (r?.ok) { toast.success("Removida"); await Promise.all([loadInfo(), loadRecentes()]); }
    else if (r?.motivo === "prazo_expirado") toast.warning("Não dá mais para remover essa indicação (prazo de 1h)");
    else toast.error("Não foi possível remover");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!info?.ok) {
    const motivo = info?.motivo || "erro";
    const labels: Record<string, string> = {
      token_invalido: "Esse link não existe ou está incorreto.",
      token_revogado: "Esse link foi desativado pelo administrador.",
      erro: "Não foi possível carregar o link.",
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-3">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold">Link inválido</h1>
          <p className="text-muted-foreground text-sm">{labels[motivo]}</p>
          <p className="text-xs text-muted-foreground">Peça um novo link ao responsável pela campanha.</p>
        </Card>
      </div>
    );
  }

  const tipoNice = tipoLabel[info.indicador_tipo || ""] || info.indicador_tipo;
  const candidatoNome = info.candidato_nome || "";
  const nomeIndicador = info.indicador_nome || "";
  const fillTpl = (tpl: string) => tpl
    .replace(/\{nome\}/g, nomeIndicador)
    .replace(/\{primeiro_nome\}/g, nomeIndicador.split(" ")[0] || nomeIndicador)
    .replace(/\{candidato\}/g, candidatoNome);

  const saudacaoRaw = info.page_saudacao || "Olá, {nome}!";
  const subtituloRaw = info.page_subtitulo || (candidatoNome
    ? "Cadastre quem você sabe que vai votar em {candidato}."
    : "Cadastre quem você sabe que vai votar.");
  const funcaoLabel = info.page_funcao_label || "Sua função:";
  const progressoTitulo = info.page_progresso_titulo || "Suas indicações";
  const botaoLabel = info.page_botao_label || "Indicar e adicionar outra";
  const rodape = info.page_rodape || "Esse link é pessoal e exclusivo seu. Não compartilhe com terceiros.";

  // Renderiza a saudação destacando o nome em primary quando aparece
  const saudacaoRendered = saudacaoRaw.includes("{nome}")
    ? saudacaoRaw.split("{nome}").reduce<React.ReactNode[]>((acc, chunk, i, arr) => {
        acc.push(<span key={`t-${i}`}>{chunk.replace(/\{candidato\}/g, candidatoNome)}</span>);
        if (i < arr.length - 1) acc.push(<span key={`n-${i}`} className="text-primary">{nomeIndicador}</span>);
        return acc;
      }, [])
    : fillTpl(saudacaoRaw);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="px-4 pt-6 pb-4 max-w-md mx-auto text-center">
        {info.candidato_logo && (
          <img src={info.candidato_logo} alt={candidatoNome} className="h-16 mx-auto mb-3 object-contain" />
        )}
        <h1 className="text-lg font-bold leading-tight">{saudacaoRendered}</h1>
        <p className="text-sm text-muted-foreground mt-1">{fillTpl(subtituloRaw)}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{funcaoLabel} {tipoNice}</p>
      </header>

      <main className="max-w-md mx-auto px-4 pb-24 space-y-5">
        {/* Progresso */}
        <Card className="p-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-muted-foreground">{progressoTitulo}</span>
            <span className="text-2xl font-bold">
              {info.total_indicacoes}
              <span className="text-sm text-muted-foreground font-normal"> / {info.meta}</span>
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {progresso >= 100
              ? "🎉 Meta cumprida! Pode continuar indicando."
              : `Faltam ${Math.max(0, (info.meta || 0) - (info.total_indicacoes || 0))} para sua meta.`}
          </p>
        </Card>

        {/* Form */}
        <Card className={`p-4 transition-shadow ${justSaved ? "ring-2 ring-emerald-400" : ""}`}>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="nome" className="text-xs">Nome completo</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Maria da Silva"
                autoFocus
                className="h-12 text-base"
              />
            </div>
            <div>
              <Label htmlFor="tel" className="text-xs">Telefone (com DDD)</Label>
              <Input
                id="tel"
                value={telefone}
                onChange={(e) => setTelefone(maskPhoneInput(e.target.value))}
                placeholder="(67) 99999-9999"
                inputMode="tel"
                className="h-12 text-base"
              />
            </div>

            {!extraOpen ? (
              <button type="button" onClick={() => setExtraOpen(true)} className="text-xs text-primary underline">
                + Adicionar bairro / observação (opcional)
              </button>
            ) : (
              <div className="space-y-3 pt-1">
                <div>
                  <Label htmlFor="bairro" className="text-xs">Bairro</Label>
                  <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} className="h-11" />
                </div>
                <div>
                  <Label htmlFor="obs" className="text-xs">Observação</Label>
                  <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={300} />
                </div>
              </div>
            )}

            <Button type="submit" disabled={saving} className="w-full h-12 text-base">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5 mr-2" />{botaoLabel}</>}
            </Button>
          </form>
        </Card>

        {/* Lista */}
        {recentes.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Suas últimas indicações ({recentes.length})
            </h2>
            <ul className="space-y-2">
              {recentes.map((r) => {
                const recent = Date.now() - new Date(r.created_at).getTime() < 60 * 60 * 1000;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtPhone(r.telefone)}{r.bairro ? ` — ${r.bairro}` : ""}
                      </div>
                    </div>
                    {recent && (
                      <Button size="sm" variant="ghost" onClick={() => remover(r.id)} aria-label="Remover">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-muted-foreground mt-2">
              Você pode remover uma indicação em até 1 hora após cadastrar.
            </p>
          </Card>
        )}

        <p className="text-[10px] text-center text-muted-foreground pt-2">
          Esse link é pessoal e exclusivo seu. Não compartilhe com terceiros.
        </p>
      </main>
    </div>
  );
}
