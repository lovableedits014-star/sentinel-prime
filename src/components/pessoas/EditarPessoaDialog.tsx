import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatCPF, formatPhone, isValidCPF, onlyDigits, translateRegistrationError } from "@/lib/cpf";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoa: any;
  onSuccess: () => void;
}

const TIPO_OPTIONS = [
  { value: "cidadao", label: "Cidadão" },
  { value: "eleitor", label: "Eleitor" },
  { value: "apoiador", label: "Apoiador" },
  { value: "lideranca", label: "Liderança" },
  { value: "lider", label: "Líder (Contratado)" },
  { value: "contratado", label: "Contratado (Liderado)" },
  { value: "indicado", label: "Indicado" },
  { value: "jornalista", label: "Jornalista" },
  { value: "influenciador", label: "Influenciador" },
  { value: "voluntario", label: "Voluntário" },
  { value: "adversario", label: "Adversário" },
];

const NIVEL_OPTIONS = [
  { value: "desconhecido", label: "Desconhecido" }, { value: "simpatizante", label: "Simpatizante" },
  { value: "apoiador", label: "Apoiador" }, { value: "militante", label: "Militante" },
  { value: "opositor", label: "Opositor" },
];

const ORIGEM_OPTIONS = [
  { value: "manual", label: "Manual" }, { value: "rede_social", label: "Rede Social" },
  { value: "formulario", label: "Formulário" }, { value: "evento", label: "Evento" },
  { value: "importacao", label: "Importação" },
];

const STATUS_LEAD_OPTIONS = [
  { value: "novo", label: "Novo" }, { value: "contato_whatsapp", label: "Contato WhatsApp" },
  { value: "em_conversa", label: "Em Conversa" }, { value: "proposta_enviada", label: "Proposta Enviada" },
  { value: "fechado", label: "Fechado" }, { value: "perdido", label: "Perdido" },
];

const CLASSIF_POLITICA_OPTIONS = [
  { value: "indefinido", label: "Indefinido" }, { value: "apoiador", label: "Apoiador" },
  { value: "simpatizante", label: "Simpatizante" }, { value: "oposicao", label: "Oposição" },
  { value: "lideranca", label: "Liderança" },
];

const TIPOS_COM_DADOS_ELEITORAIS = ["lider", "contratado", "liderado", "indicado", "eleitor"];
const TIPOS_COM_VOTO = ["indicado", "contratado", "liderado", "lider"];

export default function EditarPessoaDialog({ open, onOpenChange, pessoa, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState("cidadao");
  const [nivelApoio, setNivelApoio] = useState("desconhecido");
  const [origemContato, setOrigemContato] = useState("manual");
  const [tagsStr, setTagsStr] = useState("");
  const [notasInternas, setNotasInternas] = useState("");
  const [statusLead, setStatusLead] = useState("novo");
  const [classificacaoPolitica, setClassificacaoPolitica] = useState("indefinido");
  const [zonaEleitoral, setZonaEleitoral] = useState("");
  const [secaoEleitoral, setSecaoEleitoral] = useState("");
  const [votaCandidato, setVotaCandidato] = useState("");
  const [candidatoAlternativo, setCandidatoAlternativo] = useState("");

  const showEleitoral = TIPOS_COM_DADOS_ELEITORAIS.includes(tipoPessoa);
  const showVoto = TIPOS_COM_VOTO.includes(tipoPessoa);

  useEffect(() => {
    if (open && pessoa) {
      setNome(pessoa.nome || "");
      setEmail(pessoa.email || "");
      setTelefone(pessoa.telefone || "");
      setCpf(pessoa.cpf || "");
      setCidade(pessoa.cidade || "");
      setBairro(pessoa.bairro || "");
      setEndereco(pessoa.endereco || "");
      setDataNascimento(pessoa.data_nascimento || "");
      setTipoPessoa(pessoa.tipo_pessoa || "cidadao");
      setNivelApoio(pessoa.nivel_apoio || "desconhecido");
      setOrigemContato(pessoa.origem_contato || "manual");
      setTagsStr((pessoa.tags || []).join(", "));
      setNotasInternas(pessoa.notas_internas || "");
      setStatusLead(pessoa.status_lead || "novo");
      setClassificacaoPolitica(pessoa.classificacao_politica || "indefinido");
      setZonaEleitoral(pessoa.zona_eleitoral || "");
      setSecaoEleitoral(pessoa.secao_eleitoral || "");
      setVotaCandidato(pessoa.vota_candidato || "");
      setCandidatoAlternativo(pessoa.candidato_alternativo || "");
    }
  }, [open, pessoa]);

  async function handleSave() {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    const cpfDigits = onlyDigits(cpf);
    if (cpfDigits && !isValidCPF(cpfDigits)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      return;
    }
    setSaving(true);

    const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);

    const { error } = await supabase.from("pessoas").update({
      nome: nome.trim(),
      email: email.trim() || null,
      telefone: onlyDigits(telefone) || null,
      cpf: cpfDigits || null,
      cidade: cidade.trim() || null,
      bairro: bairro.trim() || null,
      endereco: endereco.trim() || null,
      data_nascimento: dataNascimento || null,
      tipo_pessoa: tipoPessoa,
      nivel_apoio: nivelApoio,
      origem_contato: origemContato,
      tags: tags.length > 0 ? tags : [],
      notas_internas: notasInternas.trim() || null,
      status_lead: statusLead,
      classificacao_politica: classificacaoPolitica,
      zona_eleitoral: zonaEleitoral.trim() || null,
      secao_eleitoral: secaoEleitoral.trim() || null,
      vota_candidato: votaCandidato.trim() || null,
      candidato_alternativo: candidatoAlternativo.trim() || null,
    } as any).eq("id", pessoa.id);

    setSaving(false);
    if (error) {
      const friendly = translateRegistrationError(error);
      toast.error(friendly || "Erro ao salvar");
      console.error(error);
    } else {
      toast.success("Pessoa atualizada!");
      onOpenChange(false);
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Pessoa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255} /></div>
            <div><Label>Telefone</Label><Input value={formatPhone(telefone)} onChange={e => setTelefone(onlyDigits(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" maxLength={16} /></div>
          </div>
          <div>
            <Label>CPF</Label>
            <Input value={formatCPF(cpf)} onChange={e => setCpf(onlyDigits(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
            <p className="text-xs text-muted-foreground mt-1">Opcional. Usado para evitar cadastros duplicados.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cidade</Label><Input value={cidade} onChange={e => setCidade(e.target.value)} maxLength={100} /></div>
            <div><Label>Bairro</Label><Input value={bairro} onChange={e => setBairro(e.target.value)} maxLength={100} /></div>
          </div>
          <div><Label>Endereço</Label><Input value={endereco} onChange={e => setEndereco(e.target.value)} maxLength={300} /></div>
          <div>
            <Label>Data de Nascimento</Label>
            <Input type="date" value={dataNascimento} onChange={e => setDataNascimento(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de Pessoa</Label>
              <Select value={tipoPessoa} onValueChange={setTipoPessoa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nível de Apoio</Label>
              <Select value={nivelApoio} onValueChange={setNivelApoio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NIVEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Origem</Label>
              <Select value={origemContato} onValueChange={setOrigemContato}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGEM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status Lead</Label>
              <Select value={statusLead} onValueChange={setStatusLead}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_LEAD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Classif. Política</Label>
              <Select value={classificacaoPolitica} onValueChange={setClassificacaoPolitica}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLASSIF_POLITICA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {showEleitoral && (
            <>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dados Eleitorais</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Zona Eleitoral</Label><Input value={zonaEleitoral} onChange={e => setZonaEleitoral(e.target.value)} maxLength={20} /></div>
                <div><Label>Seção Eleitoral</Label><Input value={secaoEleitoral} onChange={e => setSecaoEleitoral(e.target.value)} maxLength={20} /></div>
              </div>
            </>
          )}

          {showVoto && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vota no candidato?</Label>
                <Select value={votaCandidato} onValueChange={setVotaCandidato}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="indeciso">Indeciso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Candidato alternativo</Label>
                <Input value={candidatoAlternativo} onChange={e => setCandidatoAlternativo(e.target.value)} maxLength={100} />
              </div>
            </div>
          )}

          <Separator />

          <div><Label>Tags (separadas por vírgula)</Label><Input value={tagsStr} onChange={e => setTagsStr(e.target.value)} maxLength={500} /></div>
          <div><Label>Notas Internas</Label><Textarea value={notasInternas} onChange={e => setNotasInternas(e.target.value)} rows={3} maxLength={2000} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
