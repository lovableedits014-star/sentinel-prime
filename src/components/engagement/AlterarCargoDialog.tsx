import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, UserCog } from "lucide-react";
import { toast } from "sonner";
import {
  alterarCargo,
  cargoExigeTelefone,
  cargoLabel,
  CARGOS_ATRIBUIVEIS,
  ORIGEM_LABEL,
  type Origem,
} from "@/lib/engagement-team";

export type AlvoCargo = {
  origem: Origem;
  refId: string;
  nome: string;
  cargo: string;
  telefone: string | null;
  cidade: string | null;
  regiao: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alvo: AlvoCargo | null;
  onChanged: () => void;
}

export default function AlterarCargoDialog({ open, onOpenChange, alvo, onChanged }: Props) {
  const [novoCargo, setNovoCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [regiao, setRegiao] = useState("");
  const [orfaos, setOrfaos] = useState<"avulso" | "bloquear">("avulso");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !alvo) return;
    setNovoCargo("");
    setTelefone(alvo.telefone || "");
    setCidade(alvo.cidade || "");
    setRegiao(alvo.regiao || "");
    setOrfaos("avulso");
  }, [open, alvo?.refId]);

  const exigeTelefone = !!novoCargo && cargoExigeTelefone(novoCargo);
  const eraEstrutura = !!alvo && ["coordenador", "lider"].includes(alvo.cargo);

  async function salvar() {
    if (!alvo || !novoCargo) return;
    const tel = telefone.replace(/\D/g, "");
    if (exigeTelefone && tel.length < 10) {
      toast.error("Informe um telefone com DDD (mínimo 10 dígitos) para este cargo.");
      return;
    }
    if (exigeTelefone && !cidade.trim()) {
      toast.error("Informe a cidade para cargos da estrutura eleitoral.");
      return;
    }
    setSaving(true);
    try {
      const res = await alterarCargo({
        origem: alvo.origem,
        refId: alvo.refId,
        novoCargo,
        telefone: tel || null,
        cidade: cidade.trim() || null,
        regiao: regiao.trim() || null,
        orfaos,
      });
      toast.success(
        `${alvo.nome} agora é ${cargoLabel(res.novo_cargo)}` +
          (res.orfaos_desvinculados > 0
            ? ` — ${res.orfaos_desvinculados} subordinado(s) ficaram avulsos`
            : ""),
      );
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao alterar cargo: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Alterar cargo
          </DialogTitle>
          <DialogDescription>
            {alvo
              ? `${alvo.nome} — hoje ${cargoLabel(alvo.cargo)} (${ORIGEM_LABEL[alvo.origem]}). O registro é movido de verdade e o histórico social vai junto.`
              : "Selecione uma pessoa."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Novo cargo</Label>
            <Select value={novoCargo} onValueChange={setNovoCargo}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o novo cargo" />
              </SelectTrigger>
              <SelectContent>
                {CARGOS_ATRIBUIVEIS.filter((c) => c !== alvo?.cargo).map((c) => (
                  <SelectItem key={c} value={c}>
                    {cargoLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {exigeTelefone && (
            <>
              <div className="space-y-1.5">
                <Label>Telefone (com DDD)</Label>
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(67) 99999-9999"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Campo Grande" />
                </div>
                <div className="space-y-1.5">
                  <Label>Região / bairro</Label>
                  <Input value={regiao} onChange={(e) => setRegiao(e.target.value)} placeholder="Centro" />
                </div>
              </div>
            </>
          )}

          {eraEstrutura && (
            <div className="space-y-1.5">
              <Label>Subordinados vinculados</Label>
              <Select value={orfaos} onValueChange={(v) => setOrfaos(v as "avulso" | "bloquear")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="avulso">Desvincular e manter como avulsos</SelectItem>
                  <SelectItem value="bloquear">Bloquear a mudança se houver subordinados</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Nenhum contato é apagado — os subordinados continuam cadastrados, apenas sem vínculo.
              </p>
            </div>
          )}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              O @ do Instagram, o vínculo do Facebook e todo o histórico de interações são preservados na
              mudança.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving || !novoCargo}>
            {saving ? "Movendo…" : "Confirmar mudança"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
