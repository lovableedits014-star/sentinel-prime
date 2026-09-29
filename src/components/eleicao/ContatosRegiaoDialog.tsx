import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  filtrarContatosRegiao,
  gerarContatosRegiaoPdf,
  type NivelContatoRegiao,
  type PessoaContatoRegiao,
} from "@/lib/eleicao-contatos-regiao-pdf";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regiao: string;
  pessoas: PessoaContatoRegiao[];
};
const ROTULOS: Record<NivelContatoRegiao, string> = {
  coordenador: "Coordenadores",
  lider: "Líderes",
  cabo: "Cabos",
};

export default function ContatosRegiaoDialog({ open, onOpenChange, regiao, pessoas }: Props) {
  const [niveis, setNiveis] = useState<NivelContatoRegiao[]>(["coordenador", "lider", "cabo"]);
  const [telefone, setTelefone] = useState(true);
  const [endereco, setEndereco] = useState(true);
  const [arquivados, setArquivados] = useState(false);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNiveis(["coordenador", "lider", "cabo"]);
    setTelefone(true);
    setEndereco(true);
    setArquivados(false);
  }, [open]);

  const opcoes = useMemo(
    () => ({
      niveis,
      exibirTelefone: telefone,
      exibirEndereco: endereco,
      incluirArquivados: arquivados,
    }),
    [niveis, telefone, endereco, arquivados],
  );
  const quantidade = useMemo(
    () => filtrarContatosRegiao(pessoas, opcoes).length,
    [pessoas, opcoes],
  );
  const alternarNivel = (nivel: NivelContatoRegiao, marcado: boolean) =>
    setNiveis((atuais) =>
      marcado ? Array.from(new Set([...atuais, nivel])) : atuais.filter((item) => item !== nivel),
    );

  const gerar = async () => {
    setGerando(true);
    try {
      const resultado = await gerarContatosRegiaoPdf({ regiao, pessoas, opcoes });
      toast.success(`PDF gerado com ${resultado.contatos} contato(s).`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar a lista de contatos.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !gerando && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar contatos de {regiao}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Escolha quem e quais informações deseja incluir no PDF.
        </p>
        <div className="space-y-4 pt-2">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Quem incluir</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(ROTULOS) as NivelContatoRegiao[]).map((nivel) => (
                <label
                  key={nivel}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  {ROTULOS[nivel]}
                  <Switch
                    checked={niveis.includes(nivel)}
                    onCheckedChange={(value) => alternarNivel(nivel, value)}
                    aria-label={`Incluir ${ROTULOS[nivel]}`}
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Informações do contato</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                Telefone
                <Switch
                  checked={telefone}
                  onCheckedChange={setTelefone}
                  aria-label="Exibir telefone"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                Endereço completo
                <Switch
                  checked={endereco}
                  onCheckedChange={setEndereco}
                  aria-label="Exibir endereço"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm sm:col-span-2">
                Incluir cadastros arquivados
                <Switch
                  checked={arquivados}
                  onCheckedChange={setArquivados}
                  aria-label="Incluir cadastros arquivados"
                />
              </label>
            </div>
          </section>
          <section className="rounded-lg border bg-muted/40 p-4" aria-live="polite">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prévia do relatório
            </p>
            <p className="mt-1 text-sm">
              <strong>{quantidade}</strong> contato(s), separados por coordenador, líder e cabo.
            </p>
          </section>
          <Button
            className="w-full gap-2"
            disabled={gerando || quantidade === 0 || niveis.length === 0}
            onClick={gerar}
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {gerando ? "Gerando PDF..." : "Baixar lista de contatos"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
