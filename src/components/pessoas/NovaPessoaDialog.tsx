import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCPF, formatPhone, isValidCPF, onlyDigits, translateRegistrationError } from "@/lib/cpf";
import { findFuncionarioByPhone } from "@/lib/funcionario-link";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Nome pré-preenchido ao abrir (usado pelo cadastro de perfis do engajamento). */
  initialNome?: string;
  onSuccess: () => void;
}


const TIPO_OPTIONS = [
  { value: "apoiador", label: "Apoiador" },
  { value: "funcionario", label: "Funcionário" },
  { value: "coordenador", label: "Coordenador" },
  { value: "lider", label: "Líder" },
  { value: "cabo", label: "Cabo Eleitoral" },
];

export default function NovaPessoaDialog({ open, onOpenChange, clientId, initialNome, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [cidade, setCidade] = useState("Campo Grande");
  const [bairro, setBairro] = useState("");
  const [tipo, setTipo] = useState("apoiador");

  // Link confirmation dialog state
  const [linkPrompt, setLinkPrompt] = useState<{
    funcionarioId: string;
    funcionarioNome: string;
  } | null>(null);

  useEffect(() => {
    if (open && initialNome) setNome(initialNome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialNome]);



  function resetForm() {
    setNome(""); setEmail(""); setTelefone(""); setCpf("");
    setCidade("Campo Grande"); setBairro(""); setTipo("apoiador");
  }

  async function doInsert(funcionarioId: string | null) {
    setSaving(true);
    const cpfDigits = onlyDigits(cpf);
    const telDigits = onlyDigits(telefone);
    let error: any = null;

    if (tipo === "apoiador") {
      const r = await supabase.from("pessoas").insert({
        client_id: clientId,
        nome: nome.trim(),
        email: email.trim() || null,
        telefone: telDigits || null,
        cpf: cpfDigits || null,
        cidade: cidade.trim() || null,
        bairro: bairro.trim() || null,
        tipo_pessoa: "apoiador" as any,
        nivel_apoio: "apoiador" as any,
        origem_contato: "manual" as any,
      } as any);
      error = r.error;
    } else if (tipo === "funcionario") {
      const r = await supabase.from("funcionarios").insert({
        client_id: clientId,
        nome: nome.trim(),
        email: email.trim() || null,
        telefone: telDigits || "",
        cpf: cpfDigits || null,
        cidade: cidade.trim() || null,
        bairro: bairro.trim() || null,
      } as any);
      error = r.error;
    } else {
      // coordenador / lider / cabo → eleicao_pessoas
      const r = await supabase.from("eleicao_pessoas" as any).insert({
        client_id: clientId,
        nome: nome.trim(),
        email: email.trim() || null,
        telefone: telDigits || null,
        cpf: cpfDigits || null,
        cidade: cidade.trim() || "Campo Grande",
        bairro: bairro.trim() || null,
        tipo,
        funcionario_id: funcionarioId,
      } as any);
      error = r.error;
    }

    setSaving(false);
    if (error) {
      const friendly = translateRegistrationError(error);
      toast.error(friendly || error.message || "Erro ao salvar");
      return;
    }

    toast.success("Cadastro criado com sucesso!");
    resetForm();
    onOpenChange(false);
    onSuccess();
  }

  async function handleSave() {
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const cpfDigits = onlyDigits(cpf);
    if (cpfDigits && !isValidCPF(cpfDigits)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      return;
    }
    const telDigits = onlyDigits(telefone);

    // Para coordenador/líder/cabo: se telefone já é de funcionário, oferecer vínculo.
    if (["coordenador", "lider", "cabo"].includes(tipo) && telDigits.length >= 10) {
      const func = await findFuncionarioByPhone(clientId, telDigits);
      if (func) {
        setLinkPrompt({ funcionarioId: func.id, funcionarioNome: func.nome });
        return;
      }
    }

    await doInsert(null);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Pessoa</DialogTitle>
            <DialogDescription>
              Cadastre apoiadores, funcionários ou membros da estrutura eleitoral (coordenador, líder, cabo).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" maxLength={200} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefone</Label>
                <Input
                  value={formatPhone(telefone)}
                  onChange={e => setTelefone(onlyDigits(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  maxLength={16}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" maxLength={255} />
              </div>
            </div>

            <div>
              <Label>CPF</Label>
              <Input
                value={formatCPF(cpf)}
                onChange={e => setCpf(onlyDigits(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={14}
              />
              <p className="text-xs text-muted-foreground mt-1">Opcional. Usado para evitar duplicação.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cidade</Label>
                <Input value={cidade} onChange={e => setCidade(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={bairro} onChange={e => setBairro(e.target.value)} maxLength={100} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!linkPrompt} onOpenChange={(o) => !o && setLinkPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Telefone já é de um funcionário</AlertDialogTitle>
            <AlertDialogDescription>
              Esse telefone já está cadastrado como funcionário <strong>{linkPrompt?.funcionarioNome}</strong>.
              Deseja vincular esse novo papel ao mesmo funcionário (sem duplicar o cadastro)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLinkPrompt(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const id = linkPrompt!.funcionarioId;
                setLinkPrompt(null);
                await doInsert(id);
              }}
            >
              Vincular ao funcionário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
