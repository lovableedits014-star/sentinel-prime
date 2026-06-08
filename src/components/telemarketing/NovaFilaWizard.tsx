import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, Check, Database, FileSpreadsheet, Megaphone, Users2, Vote } from "lucide-react";
import { toast } from "sonner";

type Origem = "csv" | "estrutura" | "indicados_eleicao" | "contratados" | "indicados_contratados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onCreated: (campanhaId: string) => void;
}

const ORIGEM_INFO: Record<Origem, { label: string; icon: any; desc: string }> = {
  csv: { label: "CSV / colar lista", icon: FileSpreadsheet, desc: "Cole nomes e telefones em texto. Bom para mailings comprados, listas externas." },
  estrutura: { label: "Estrutura eleitoral", icon: Users2, desc: "Coordenadores, líderes e cabos cadastrados na sua estrutura (com telefone)." },
  indicados_eleicao: { label: "Indicados (eleição)", icon: Vote, desc: "Pessoas indicadas pela estrutura na eleição atual." },
  contratados: { label: "Contratados / liderados", icon: Database, desc: "Pessoas contratadas que aceitaram o termo (líderes e liderados)." },
  indicados_contratados: { label: "Indicados dos contratados", icon: Megaphone, desc: "Quem cada contratado indicou organicamente." },
};

export default function NovaFilaWizard({ open, onOpenChange, clientId, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState<Origem>("estrutura");
  const [csv, setCsv] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [tipo, setTipo] = useState<string>("__all__");
  const [indicadorId, setIndicadorId] = useState<string>("__all__");
  const [apenasPendentes, setApenasPendentes] = useState(true);
  const [substituir, setSubstituir] = useState(false);
  const [intro, setIntro] = useState("");
  const [perguntas, setPerguntas] = useState("");
  const [tags, setTags] = useState("Não mora mais aqui\nNúmero errado\nPediu retorno");
  const [indicadores, setIndicadores] = useState<{ id: string; nome: string; tipo: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setNome(""); setDescricao(""); setOrigem("estrutura"); setCsv("");
    setCidade(""); setBairro(""); setTipo("__all__"); setIndicadorId("__all__");
    setApenasPendentes(true); setSubstituir(false);
    setIntro(""); setPerguntas("");
  }, [open]);

  useEffect(() => {
    if (!clientId || !open) return;
    supabase.rpc("tele_list_indicadores" as any, { _client_id: clientId }).then(({ data }) => {
      setIndicadores((data as any[]) || []);
    });
  }, [clientId, open]);

  const csvRows = useMemo(() => {
    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [] as { nome: string; telefone: string; cidade?: string; bairro?: string }[];
    const header = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim());
    const hasHeader = header.includes("nome") && (header.includes("telefone") || header.includes("celular"));
    const cN = hasHeader ? header.indexOf("nome") : 0;
    const cT = hasHeader ? (header.indexOf("telefone") >= 0 ? header.indexOf("telefone") : header.indexOf("celular")) : 1;
    const cC = hasHeader ? header.indexOf("cidade") : -1;
    const cB = hasHeader ? header.indexOf("bairro") : -1;
    return (hasHeader ? lines.slice(1) : lines).map(l => {
      const p = l.split(/[,;\t]/).map(s => s.trim().replace(/^"|"$/g, ""));
      return { nome: p[cN] || "", telefone: p[cT] || "", cidade: cC >= 0 ? p[cC] : undefined, bairro: cB >= 0 ? p[cB] : undefined };
    }).filter(r => r.nome && r.telefone);
  }, [csv]);

  const tipoOptionsByOrigem = (): { value: string; label: string }[] => {
    if (origem === "estrutura" || origem === "indicados_eleicao") {
      return [
        { value: "coordenador", label: "Coordenador" },
        { value: "lider", label: "Líder" },
        { value: "cabo", label: "Cabo" },
      ];
    }
    if (origem === "contratados") {
      return [{ value: "lider", label: "Líder" }, { value: "liderado", label: "Liderado" }];
    }
    return [];
  };

  const canNext = () => {
    if (step === 1) return nome.trim().length > 0;
    if (step === 2) return true;
    if (step === 3) {
      if (origem === "csv") return csvRows.length > 0;
      return true;
    }
    return true;
  };

  const finish = async () => {
    setBusy(true);
    const perguntasArr = perguntas.split("\n").map(s => s.trim()).filter(Boolean);
    const tagsArr = tags.split("\n").map(s => s.trim()).filter(Boolean);
    const filtros: any = {
      cidade: cidade.trim() ? `%${cidade.trim()}%` : "",
      bairro: bairro.trim() ? `%${bairro.trim()}%` : "",
      tipo: tipo === "__all__" ? "" : tipo,
      indicador_id: indicadorId === "__all__" ? "" : indicadorId,
      apenas_pendentes: apenasPendentes,
      substituir,
    };
    const { data, error } = await supabase.rpc("tele_create_fila_wizard" as any, {
      _client_id: clientId,
      _nome: nome.trim(),
      _descricao: descricao.trim() || null,
      _script_intro: intro.trim() || null,
      _script_perguntas: perguntasArr,
      _tags_rapidas: tagsArr,
      _origem: origem,
      _filtros: filtros,
      _csv_rows: origem === "csv" ? csvRows : [],
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const total = (data as any)?.total ?? 0;
    const id = (data as any)?.campanha_id;
    toast.success(`Fila criada com ${total} contato(s)`);
    onCreated(id);
    onOpenChange(false);
  };

  const totalSteps = 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova fila de ligação — Passo {step} de {totalSteps}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded ${i + 1 <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Dê um nome reconhecível. Os operadores vão escolher a fila pelo nome.</p>
            <div>
              <Label>Nome da fila *</Label>
              <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Centro - 1ª rodada" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Objetivo, prazo, observações…" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">De onde vêm os contatos desta fila?</p>
            {(Object.keys(ORIGEM_INFO) as Origem[]).map(k => {
              const Info = ORIGEM_INFO[k];
              const Icon = Info.icon;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOrigem(k)}
                  className={`w-full text-left p-3 border rounded-lg flex items-start gap-3 transition-colors ${
                    origem === k ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{Info.label}</p>
                    <p className="text-xs text-muted-foreground">{Info.desc}</p>
                  </div>
                  {origem === k && <Check className="w-4 h-4 text-primary shrink-0 ml-auto" />}
                </button>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {origem === "csv" ? (
              <>
                <Label>Cole o CSV (cabeçalho: nome, telefone, cidade, bairro)</Label>
                <Textarea
                  rows={9} value={csv} onChange={(e) => setCsv(e.target.value)}
                  placeholder={"nome,telefone,cidade,bairro\nMaria Silva,11999990000,São Paulo,Centro"}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {csvRows.length > 0 ? `${csvRows.length} linha(s) válida(s) detectadas.` : "Cole linhas com nome e telefone."}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Filtre quem entra na fila. Deixe em branco para incluir todos.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cidade</Label>
                    <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: São Paulo" />
                  </div>
                  <div>
                    <Label>Bairro</Label>
                    <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex: Centro" />
                  </div>
                </div>
                {tipoOptionsByOrigem().length > 0 && (
                  <div>
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {tipoOptionsByOrigem().map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {origem === "indicados_eleicao" && indicadores.length > 0 && (
                  <div>
                    <Label>Indicador específico (opcional)</Label>
                    <Select value={indicadorId} onValueChange={setIndicadorId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="__all__">Qualquer indicador</SelectItem>
                        {indicadores.map(i => (
                          <SelectItem key={i.id} value={i.id}>{i.nome} ({i.tipo})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2 pt-2 border-t">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={apenasPendentes} onCheckedChange={(v) => setApenasPendentes(!!v)} />
                    Apenas contatos ainda não ligados
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={substituir} onCheckedChange={(v) => setSubstituir(!!v)} />
                    Substituir vínculo se o contato já estiver em outra fila
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Script e tags ajudam o operador na hora da ligação. Tudo opcional.</p>
            <div>
              <Label>Introdução (lida pelo operador)</Label>
              <Textarea rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Bom dia, aqui é {operador} falando em nome do candidato…" />
            </div>
            <div>
              <Label>Perguntas do roteiro (uma por linha)</Label>
              <Textarea rows={4} value={perguntas} onChange={(e) => setPerguntas(e.target.value)} placeholder={"Você costuma votar nas eleições municipais?\nO que mais te preocupa hoje no bairro?"} />
            </div>
            <div>
              <Label>Tags rápidas (uma por linha)</Label>
              <Textarea rows={3} value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Revise antes de criar a fila.</p>
            <div className="rounded-lg border p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Nome</span><span className="font-medium text-right">{nome}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Origem</span><Badge variant="outline">{ORIGEM_INFO[origem].label}</Badge></div>
              {origem === "csv" ? (
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Contatos no CSV</span><span className="font-medium">{csvRows.length}</span></div>
              ) : (
                <>
                  {cidade && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Cidade</span><span>{cidade}</span></div>}
                  {bairro && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Bairro</span><span>{bairro}</span></div>}
                  {tipo !== "__all__" && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Tipo</span><span>{tipo}</span></div>}
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Apenas não ligados</span><span>{apenasPendentes ? "Sim" : "Não"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Substituir vínculo</span><span>{substituir ? "Sim" : "Não"}</span></div>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Ao confirmar, a campanha será criada e os contatos correspondentes serão vinculados a ela. Você verá o link do operador na próxima tela.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={busy}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
          )}
          {step < totalSteps ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Avançar <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy}>
              {busy ? "Criando…" : "Criar fila"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
