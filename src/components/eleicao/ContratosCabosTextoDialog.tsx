import { useMemo, useState } from "react";
import { FileText, Loader2, Printer, Trash2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  analisarListaContratos,
  imprimirContratosCabosTexto,
  type CaboContratoTexto,
} from "@/lib/eleicao-contratos-texto";

interface Props {
  clientId: string;
}

const exemplo = `Maria da Silva
Cel. 67 99999 9999
Rua Exemplo 123
Bairro Exemplo`;

export default function ContratosCabosTextoDialog({ clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [cabos, setCabos] = useState<CaboContratoTexto[]>([]);
  const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [gerando, setGerando] = useState(false);

  const incompletos = useMemo(
    () => cabos.filter((cabo) => !cabo.nome.trim() || cabo.telefone.replace(/\D/g, "").length < 10),
    [cabos],
  );

  function analisar() {
    const encontrados = analisarListaContratos(texto);
    setCabos(encontrados);
    if (!encontrados.length) {
      toast.error(
        "Nenhum contato reconhecido. Use nome, telefone, endereço e bairro em linhas separadas.",
      );
      return;
    }
    toast.success(`${encontrados.length} cabo(s) reconhecido(s). Confira antes de imprimir.`);
  }

  function atualizar(id: string, campo: keyof CaboContratoTexto, conteudo: string) {
    setCabos((atuais) =>
      atuais.map((cabo) => (cabo.id === id ? { ...cabo, [campo]: conteudo } : cabo)),
    );
  }

  async function imprimir() {
    if (!cabos.length) return toast.error("Analise a lista antes de gerar os contratos.");
    if (incompletos.length)
      return toast.error("Corrija os contatos destacados: nome e telefone são obrigatórios.");
    const valorNumero = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valorNumero) || valorNumero <= 0)
      return toast.error("Informe o valor da contratação.");
    if (!inicio || !fim) return toast.error("Informe o início e o término dos contratos.");

    setGerando(true);
    try {
      await imprimirContratosCabosTexto(cabos, clientId, {
        valor: valorNumero,
        vigenciaInicio: inicio,
        vigenciaFim: fim,
      });
      toast.success(`${cabos.length} contrato(s) preparados para impressão.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar os contratos.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Contratos em lote
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Contratos de cabos a partir de uma lista</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cole a mensagem recebida, confira os campos reconhecidos e gere uma página por cabo
              pronta para imprimir. Esta etapa não cadastra pessoas no sistema.
            </p>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-[340px_1fr]">
            <div className="space-y-4">
              <div>
                <Label>Lista recebida</Label>
                <Textarea
                  className="mt-1 min-h-64 font-mono text-xs"
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                  placeholder={exemplo}
                />
              </div>
              <Button
                className="w-full"
                variant="secondary"
                onClick={analisar}
                disabled={!texto.trim()}
              >
                <WandSparkles className="mr-2 h-4 w-4" />
                Reconhecer contatos
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Valor por cabo *</Label>
                  <Input
                    value={valor}
                    onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))}
                    placeholder="150,00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <Label>Início *</Label>
                  <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div>
                  <Label>Término *</Label>
                  <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Nome e telefone são obrigatórios. CPF, quando não informado, permanece em branco
                para preenchimento manual. O contrato utilizado é o modelo de cabo configurado em
                “Modelos de contrato”.
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Prévia editável</h3>
                  <p className="text-xs text-muted-foreground">
                    {cabos.length} contrato(s) reconhecido(s)
                  </p>
                </div>
              </div>
              {!cabos.length ? (
                <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Cole a lista e clique em “Reconhecer contatos”.
                </div>
              ) : (
                cabos.map((cabo, indice) => {
                  const invalido =
                    !cabo.nome.trim() || cabo.telefone.replace(/\D/g, "").length < 10;
                  return (
                    <div
                      key={cabo.id}
                      className={`rounded-lg border p-3 ${invalido ? "border-destructive" : ""}`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Contrato {indice + 1}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() =>
                            setCabos((atuais) => atuais.filter((item) => item.id !== cabo.id))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-12">
                        <div className="md:col-span-5">
                          <Label>Nome *</Label>
                          <Input
                            value={cabo.nome}
                            onChange={(e) => atualizar(cabo.id, "nome", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-4">
                          <Label>Telefone *</Label>
                          <Input
                            value={cabo.telefone}
                            onChange={(e) => atualizar(cabo.id, "telefone", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label>CPF</Label>
                          <Input
                            value={cabo.cpf}
                            onChange={(e) => atualizar(cabo.id, "cpf", e.target.value)}
                            placeholder="Opcional"
                          />
                        </div>
                        <div className="md:col-span-6">
                          <Label>Rua</Label>
                          <Input
                            value={cabo.rua}
                            onChange={(e) => atualizar(cabo.id, "rua", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Número</Label>
                          <Input
                            value={cabo.numero}
                            onChange={(e) => atualizar(cabo.id, "numero", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-4">
                          <Label>Bairro</Label>
                          <Input
                            value={cabo.bairro}
                            onChange={(e) => atualizar(cabo.id, "bairro", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button onClick={imprimir} disabled={gerando || !cabos.length}>
              {gerando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Gerar e imprimir {cabos.length || ""} contrato(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
