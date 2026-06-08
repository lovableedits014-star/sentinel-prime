import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Upload, Power, Megaphone, ShieldAlert, FileText, Pencil } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Campanha {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  script_intro?: string | null;
  script_perguntas?: string[] | null;
  tags_rapidas?: string[] | null;
}

interface ContatoAvulso {
  id: string;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  ligacao_status: string | null;
  campanha_id: string | null;
}

export default function TelemarketingAdminCampanhas() {
  const { clientId, isLoading: ctxLoading, needsClientSelection } = useActiveClientId();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [contatos, setContatos] = useState<ContatoAvulso[]>([]);
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [csv, setCsv] = useState("");
  const [importingTo, setImportingTo] = useState<string>("");
  const [importing, setImporting] = useState(false);

  // Script edit dialog
  const [editing, setEditing] = useState<Campanha | null>(null);
  const [eIntro, setEIntro] = useState("");
  const [ePerguntas, setEPerguntas] = useState("");
  const [eTags, setETags] = useState("");

  const openEdit = (c: Campanha) => {
    setEditing(c);
    setEIntro(c.script_intro || "");
    setEPerguntas((c.script_perguntas || []).join("\n"));
    setETags((c.tags_rapidas || []).join("\n"));
  };

  const saveScript = async () => {
    if (!editing) return;
    const perguntas = ePerguntas.split("\n").map(s => s.trim()).filter(Boolean);
    const tags = eTags.split("\n").map(s => s.trim()).filter(Boolean);
    const { error } = await supabase.from("telemarketing_campanhas" as any).update({
      script_intro: eIntro.trim() || null,
      script_perguntas: perguntas,
      tags_rapidas: tags,
    }).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Script atualizado");
    setEditing(null);
    load();
  };

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    const [c, a] = await Promise.all([
      supabase.from("telemarketing_campanhas" as any).select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("telemarketing_contatos_avulsos" as any).select("id,nome,telefone,cidade,bairro,ligacao_status,campanha_id").eq("client_id", clientId).order("created_at", { ascending: false }).limit(500),
    ]);
    setCampanhas((c.data as any[]) || []);
    setContatos((a.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  const createCampanha = async () => {
    if (!clientId || !nome.trim()) return;
    const { error } = await supabase.from("telemarketing_campanhas" as any).insert({
      client_id: clientId, nome: nome.trim(), descricao: descricao.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setNome(""); setDescricao("");
    toast.success("Campanha criada");
    load();
  };

  const toggleAtivo = async (c: Campanha) => {
    await supabase.from("telemarketing_campanhas" as any).update({ ativo: !c.ativo }).eq("id", c.id);
    load();
  };

  const deleteCampanha = async (c: Campanha) => {
    if (!confirm(`Remover campanha "${c.nome}"? Os contatos importados ficam, apenas sem vínculo.`)) return;
    await supabase.from("telemarketing_campanhas" as any).delete().eq("id", c.id);
    load();
  };

  const parseCsv = (text: string): { nome: string; telefone: string; cidade?: string; bairro?: string }[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim());
    const hasHeader = header.includes("nome") && (header.includes("telefone") || header.includes("celular"));
    const colNome = hasHeader ? header.indexOf("nome") : 0;
    const colTel = hasHeader ? (header.indexOf("telefone") >= 0 ? header.indexOf("telefone") : header.indexOf("celular")) : 1;
    const colCidade = hasHeader ? header.indexOf("cidade") : -1;
    const colBairro = hasHeader ? header.indexOf("bairro") : -1;
    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines.map(l => {
      const parts = l.split(/[,;\t]/).map(p => p.trim().replace(/^"|"$/g, ""));
      return {
        nome: parts[colNome] || "",
        telefone: parts[colTel] || "",
        cidade: colCidade >= 0 ? parts[colCidade] : undefined,
        bairro: colBairro >= 0 ? parts[colBairro] : undefined,
      };
    }).filter(r => r.nome && r.telefone);
  };

  const handleImport = async () => {
    if (!clientId) return;
    const rows = parseCsv(csv);
    if (!rows.length) { toast.error("Nenhuma linha válida encontrada"); return; }
    setImporting(true);
    const { data, error } = await supabase.rpc("tele_import_contato_avulso_batch" as any, {
      _client_id: clientId,
      _campanha_id: importingTo && importingTo !== "__none__" ? importingTo : null,
      _rows: rows as any,
    });
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.inserted ?? 0} contatos importados`);
    setCsv("");
    load();
  };

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="w-6 h-6" /> Campanhas e mailing</h1>
        <p className="text-sm text-muted-foreground">Crie campanhas, defina o roteiro de abordagem, importe mailings CSV e acompanhe os contatos avulsos que entram na fila do operador.</p>
      </div>

      {ctxLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando contexto…</div>
      )}
      {!ctxLoading && needsClientSelection && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-200">Selecione um cliente para gerenciar campanhas.</p>
        </div>
      )}

      {clientId && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Nova campanha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Nome</label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Bairro Centro - 2ª rodada" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Descrição (opcional)</label>
                <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Quem ligar, objetivo, prazo…" />
              </div>
              <Button onClick={createCampanha} disabled={!nome.trim()} className="w-full">Criar campanha</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Importar mailing CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Campanha (opcional)</label>
                <Select value={importingTo} onValueChange={setImportingTo}>
                  <SelectTrigger><SelectValue placeholder="Sem campanha" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Sem campanha —</SelectItem>
                    {campanhas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">CSV (cabeçalho: nome, telefone, cidade, bairro)</label>
                <Textarea
                  rows={6}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={"nome,telefone,cidade,bairro\nMaria Silva,11999990000,São Paulo,Centro"}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Aceita vírgula, ponto-e-vírgula ou tab. Sem cabeçalho, usa colunas 1 (nome) e 2 (telefone).</p>
              </div>
              <Button onClick={handleImport} disabled={importing || !csv.trim()} className="w-full">
                {importing ? "Importando…" : "Importar"}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Campanhas ({campanhas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {!loading && campanhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>}
              <div className="space-y-2">
                {campanhas.map(c => {
                  const total = contatos.filter(x => x.campanha_id === c.id).length;
                  const ligados = contatos.filter(x => x.campanha_id === c.id && x.ligacao_status && x.ligacao_status !== "pendente").length;
                  const nPerguntas = (c.script_perguntas || []).length;
                  const nTags = (c.tags_rapidas || []).length;
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{c.nome}</span>
                          <Badge variant={c.ativo ? "default" : "secondary"} className="text-[10px]">
                            {c.ativo ? "Ativa" : "Inativa"}
                          </Badge>
                          {(c.script_intro || nPerguntas > 0) && (
                            <Badge variant="outline" className="text-[10px] gap-1"><FileText className="w-3 h-3" />Script</Badge>
                          )}
                          {nTags > 0 && <Badge variant="outline" className="text-[10px]">{nTags} tags</Badge>}
                        </div>
                        {c.descricao && <p className="text-xs text-muted-foreground truncate">{c.descricao}</p>}
                        <p className="text-[11px] text-muted-foreground mt-0.5">{ligados}/{total} contatos ligados</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => openEdit(c)} title="Editar script & tags">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleAtivo(c)} title={c.ativo ? "Desativar" : "Ativar"}>
                          <Power className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteCampanha(c)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Contatos avulsos ({contatos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {contatos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato importado ainda.</p>}
              <div className="space-y-1 max-h-96 overflow-auto">
                {contatos.slice(0, 200).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b py-1.5">
                    <div className="min-w-0">
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{c.telefone}</span>
                      {(c.cidade || c.bairro) && <span className="text-xs text-muted-foreground ml-2">{[c.bairro, c.cidade].filter(Boolean).join(" · ")}</span>}
                    </div>
                    <Badge variant={c.ligacao_status && c.ligacao_status !== "pendente" ? "default" : "outline"} className="text-[10px]">
                      {c.ligacao_status || "pendente"}
                    </Badge>
                  </div>
                ))}
                {contatos.length > 200 && <p className="text-[11px] text-muted-foreground pt-2">Mostrando 200 de {contatos.length}.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Script & tags — {editing?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Introdução (lida pelo operador no início)</label>
              <Textarea rows={3} value={eIntro} onChange={(e) => setEIntro(e.target.value)} placeholder="Bom dia, aqui é {operador} falando em nome do candidato…" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Perguntas do roteiro (uma por linha)</label>
              <Textarea rows={5} value={ePerguntas} onChange={(e) => setEPerguntas(e.target.value)} placeholder={"Você costuma votar nas eleições municipais?\nO que mais te preocupa hoje no bairro?"} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Tags rápidas (uma por linha) — clique aplica à observação</label>
              <Textarea rows={4} value={eTags} onChange={(e) => setETags(e.target.value)} placeholder={"Não mora mais aqui\nNúmero errado\nPediu retorno"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveScript}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
