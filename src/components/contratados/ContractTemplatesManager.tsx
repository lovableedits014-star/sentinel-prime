import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Plus, Pencil, Trash2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ContractTemplate {
  id: string;
  client_id: string;
  tipo: string;
  titulo: string;
  conteudo: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_LIDER = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE LIDERANÇA E MOBILIZAÇÃO

Data: {data}

CONTRATADO(A) - LÍDER:
Nome: {nome}
Telefone: {telefone}
E-mail: {email}
Endereço: {endereco}
Cidade: {cidade}
Bairro: {bairro}
Zona Eleitoral: {zona_eleitoral}
Redes Sociais: {redes_sociais}

CONTRATANTE: {contratante}

OBJETO DO CONTRATO:
O(A) CONTRATADO(A), na qualidade de LÍDER, se compromete a:
1. Coordenar e supervisionar a equipe de liderados sob sua responsabilidade;
2. Garantir o cumprimento das metas de indicação pela sua equipe;
3. Realizar missões de mobilização digital conforme orientações;
4. Reportar o progresso e desempenho da equipe periodicamente;
5. Marcação diária de presença no sistema.

OBRIGAÇÕES:
- Acompanhar diariamente o desempenho dos liderados;
- Motivar e orientar a equipe para cumprimento das metas;
- Fornecer indicações verdadeiras e verificáveis;
- Manter sigilo sobre estratégias e informações internas;
- Marcar presença diariamente no sistema.

VIGÊNCIA:
Este contrato tem vigência a partir da data de assinatura até o término do período eleitoral ou rescisão por qualquer das partes.


___________________________          ___________________________
     CONTRATANTE                          {nome}
                                         CONTRATADO(A) - LÍDER`;

const DEFAULT_LIDERADO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MOBILIZAÇÃO DIGITAL

Data: {data}

CONTRATADO(A):
Nome: {nome}
Telefone: {telefone}
E-mail: {email}
Endereço: {endereco}
Cidade: {cidade}
Bairro: {bairro}
Zona Eleitoral: {zona_eleitoral}
Indicado por: {lider}
Redes Sociais: {redes_sociais}

CONTRATANTE: {contratante}

OBJETO DO CONTRATO:
O(A) CONTRATADO(A) se compromete a prestar serviços de mobilização digital, incluindo:
1. Interação em publicações nas redes sociais conforme missões recebidas;
2. Indicação de contatos de potenciais apoiadores com nome e telefone;
3. Cumprimento das metas de indicação estabelecidas pelo contratante;
4. Marcação diária de presença no sistema.

OBRIGAÇÕES:
- Realizar as missões enviadas dentro do prazo solicitado;
- Fornecer indicações verdadeiras e verificáveis;
- Manter sigilo sobre estratégias e informações internas;
- Marcar presença diariamente no sistema.

VIGÊNCIA:
Este contrato tem vigência a partir da data de assinatura até o término do período eleitoral ou rescisão por qualquer das partes.


___________________________          ___________________________
     CONTRATANTE                          {nome}
                                         CONTRATADO(A)`;

interface Props {
  clientId: string;
}

export default function ContractTemplatesManager({ clientId }: Props) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Form
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("liderado");
  const [conteudo, setConteudo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTemplates(); }, [clientId]);

  async function loadTemplates() {
    const { data } = await supabase
      .from("contract_templates")
      .select("*")
      .eq("client_id", clientId)
      .order("tipo")
      .order("created_at");
    setTemplates((data || []) as any);
    setLoading(false);
  }

  function openNew(defaultTipo: string) {
    setEditingTemplate(null);
    setTitulo(defaultTipo === "lider" ? "Contrato de Líder" : "Contrato de Liderado");
    setTipo(defaultTipo);
    setConteudo(defaultTipo === "lider" ? DEFAULT_LIDER : DEFAULT_LIDERADO);
    setShowEditor(true);
  }

  function openEdit(t: ContractTemplate) {
    setEditingTemplate(t);
    setTitulo(t.titulo);
    setTipo(t.tipo);
    setConteudo(t.conteudo);
    setShowEditor(true);
  }

  async function handleSave() {
    if (!titulo.trim() || !conteudo.trim()) { toast.error("Preencha título e conteúdo."); return; }
    setSaving(true);
    if (editingTemplate) {
      const { error } = await supabase.from("contract_templates")
        .update({ titulo: titulo.trim(), tipo, conteudo: conteudo.trim(), updated_at: new Date().toISOString() } as any)
        .eq("id", editingTemplate.id);
      if (error) { toast.error("Erro ao salvar."); } else { toast.success("Modelo atualizado!"); }
    } else {
      const { error } = await supabase.from("contract_templates")
        .insert({ client_id: clientId, titulo: titulo.trim(), tipo, conteudo: conteudo.trim() } as any);
      if (error) { toast.error("Erro ao criar."); } else { toast.success("Modelo criado!"); }
    }
    setSaving(false);
    setShowEditor(false);
    loadTemplates();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este modelo de contrato?")) return;
    await supabase.from("contract_templates").delete().eq("id", id);
    toast.success("Modelo excluído!");
    loadTemplates();
  }

  const liderTemplates = templates.filter(t => t.tipo === "lider");
  const lideradoTemplates = templates.filter(t => t.tipo === "liderado");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />Modelos de Contrato
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openNew("lider")} className="gap-1 text-xs">
              <Plus className="w-3 h-3" />Líder
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("liderado")} className="gap-1 text-xs">
              <Plus className="w-3 h-3" />Liderado
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum modelo criado. Crie um modelo para Líder ou Liderado.
          </p>
        ) : (
          <>
            {liderTemplates.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Líder</p>
                {liderTemplates.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] shrink-0">Líder</Badge>
                      <span className="truncate font-medium">{t.titulo}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {lideradoTemplates.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Liderado</p>
                {lideradoTemplates.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary" className="text-[10px] shrink-0">Liderado</Badge>
                      <span className="truncate font-medium">{t.titulo}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Modelo" : "Novo Modelo de Contrato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Contrato Padrão" />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lider">Líder</SelectItem>
                    <SelectItem value="liderado">Liderado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Conteúdo do Contrato</Label>
              <p className="text-[10px] text-muted-foreground">
                Variáveis disponíveis: {"{nome}"}, {"{telefone}"}, {"{email}"}, {"{endereco}"}, {"{cidade}"}, {"{bairro}"}, {"{zona_eleitoral}"}, {"{lider}"}, {"{contratante}"}, {"{data}"}, {"{redes_sociais}"}
              </p>
              <Textarea
                value={conteudo}
                onChange={e => setConteudo(e.target.value)}
                rows={20}
                className="font-mono text-xs"
                placeholder="Digite o conteúdo do contrato..."
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingTemplate ? "Salvar Alterações" : "Criar Modelo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
